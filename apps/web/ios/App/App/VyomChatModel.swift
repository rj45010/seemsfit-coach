import Foundation
import FirebaseAuth

/// View model for the native Vyom chat. UI + streaming transport only: it streams from the same
/// Cloudflare worker with a native Firebase token, cycles the thinking phrases, retries an empty
/// reply once, and splits the `===PROPOSALS===` block for display. All business logic (proposal
/// apply, message persistence) is delegated to the web layer via the `on…` callbacks the plugin
/// wires to bridge events — so nothing here forks from the web source of truth.
@MainActor
final class VyomChatModel: ObservableObject {
    struct Msg: Identifiable, Equatable {
        enum Role { case user, assistant }
        let id = UUID()
        var role: Role
        var content: String
        var provider: String?
        var at: Date = Date()
        var attachment: Pending?    // live-session only: holds the base64 for a real thumbnail
        var attachmentKind: String? // persisted (image|video|pdf) so a chip survives a thread reload
    }
    struct Proposal: Identifiable, Equatable {
        enum State: Equatable { case idle, applying, applied, dismissed, error }
        let id = UUID()
        var summary: String
        var json: String
        var state: State = .idle
    }

    /// A picked file waiting to be sent with the next message (photo, video or PDF).
    struct Pending: Equatable {
        enum Kind { case image, video, pdf }
        var base64: String
        var mimeType: String
        var kind: Kind
        var name: String
        /// Stable string form that persists with the message (for the reload chip).
        var wireKind: String { switch kind { case .image: return "image"; case .video: return "video"; case .pdf: return "pdf" } }
    }

    /// A remembered durable fact (shown in the memory sheet).
    struct Fact: Identifiable, Equatable { let id = UUID(); var text: String }
    /// A saved conversation (shown in the history sheet).
    struct Thread: Identifiable, Equatable { let id: String; var title: String; var subtitle: String }

    @Published var messages: [Msg] = []
    @Published var proposals: [Proposal] = []
    @Published var input = ""
    @Published var thinking: String?
    @Published var busy = false
    @Published var errorText: String?
    @Published var pending: Pending?

    // Header sheets — data pushed in from the web brain.
    @Published var memoryInstructions = ""
    @Published var memoryFacts: [Fact] = []
    @Published var memoryLoaded = false
    @Published var threads: [Thread] = []
    @Published var threadsLoaded = false
    @Published var activeThreadId: String?

    // Delegated to the web brain (set by the plugin).
    var onApply: ((_ json: String, _ id: String) -> Void)?           // apply one proposal
    var onPersist: ((_ role: String, _ content: String, _ provider: String?, _ attachmentKind: String?) -> Void)?
    var onImportZip: ((_ base64: String, _ name: String) -> Void)?   // Apple Health export → web importer
    var onMemoryOpen: (() -> Void)?
    var onSaveInstructions: ((_ text: String) -> Void)?
    var onForgetFact: ((_ text: String) -> Void)?
    var onThreadsOpen: (() -> Void)?
    var onOpenThread: ((_ id: String) -> Void)?
    var onRenameThread: ((_ id: String, _ title: String) -> Void)?
    var onDeleteThread: ((_ id: String) -> Void)?

    func setMemory(instructions: String, facts: [String]) {
        memoryInstructions = instructions
        memoryFacts = facts.map { Fact(text: $0) }
        memoryLoaded = true
    }
    func setThreads(_ list: [Thread], activeId: String?) {
        threads = list; activeThreadId = activeId; threadsLoaded = true
    }
    /// Replace the transcript with a reopened thread's messages.
    func setMessages(_ msgs: [Msg], threadId: String?) {
        messages = msgs; proposals = []; errorText = nil; thinking = nil; activeThreadId = threadId
    }

    /// Append a message pushed from the web brain (e.g. Apple Health import progress/result).
    func pushMessage(role: Msg.Role, content: String) {
        messages.append(Msg(role: role, content: content))
    }

    private var system: String
    private let jarvisUrl: String
    private var thinkingTimer: Timer?
    private var streamTask: Task<Void, Never>?   // in-flight reply, so it can be stopped

    // The personal context/history load in the background so the screen opens instantly.
    private(set) var contextReady = false
    private var pendingAutoSend = false

    // Verbatim from Chat.tsx:30-37 — cycled every 1500ms until the first token.
    private let phrases = [
        "Reading your data…", "Reviewing your week…", "Checking HRV & recovery…",
        "Looking at your training…", "Thinking it through…", "Putting it together…",
    ]

    init(system: String, jarvisUrl: String, prefill: String = "", initial: [Msg] = []) {
        self.system = system; self.jarvisUrl = jarvisUrl; self.input = prefill; self.messages = initial
    }

    /// The screen opens instantly with an empty brain; the web fills in the personal context and
    /// prior thread here once its Firestore reads finish (usually well under a second).
    func setContext(system: String, initial: [Msg]) {
        self.system = system
        if messages.isEmpty { messages = initial }   // don't clobber a conversation already in progress
        contextReady = true
        if pendingAutoSend { pendingAutoSend = false; send() }
    }

    /// Quick-log seeds auto-send — but wait for the context so the first reply isn't context-blind.
    func requestAutoSend() {
        if contextReady { send() } else { pendingAutoSend = true }
    }

    // MARK: Send

    func send(_ raw: String? = nil) {
        guard !busy else { return }
        let media: [[String: String]] = pending.map { [["mimeType": $0.mimeType, "data": $0.base64]] } ?? []
        var text = (raw ?? input).trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty {
            // No text but an attachment → auto-message per kind (mirrors Chat.tsx:252).
            guard let p = pending else { return }
            text = p.kind == .pdf ? "Read this report and save the markers to my labs." : "Check my form here."
        }
        if raw == nil { input = "" }
        let attached = pending
        pending = nil
        errorText = nil
        proposals = []
        messages.append(Msg(role: .user, content: text, attachment: attached, attachmentKind: attached?.wireKind))
        onPersist?("user", text, nil, attached?.wireKind)
        let assistantIdx = messages.count
        messages.append(Msg(role: .assistant, content: ""))
        busy = true
        startThinking()
        streamTask = Task { await run(message: text, media: media, assistantIndex: assistantIdx) }
    }

    /// Stop the in-flight reply (like every AI chat) — keeps whatever streamed so far.
    func stop() {
        streamTask?.cancel()
        streamTask = nil
        stopThinking()
        busy = false
    }

    private func run(message: String, media: [[String: String]], assistantIndex: Int) async {
        let prior = historyPayload()
        var full = ""
        var provider: String?
        var reason: String?

        // Retry once if the first attempt is completely empty (Chat.tsx:282-306).
        for attempt in 0..<2 {
            full = ""; reason = nil
            if attempt > 0 { startThinking() }
            let result = await stream(message: message, history: prior, media: media) { chunk in
                self.stopThinking()
                full += chunk
                if assistantIndex < self.messages.count {
                    self.messages[assistantIndex].content = self.prose(full)
                }
            }
            provider = result.provider ?? provider
            reason = result.reason
            if Task.isCancelled { break }
            if !full.trimmingCharacters(in: .whitespaces).isEmpty { break }
        }

        stopThinking()
        // User hit stop — keep the partial text as-is, don't finalize/persist/error.
        if Task.isCancelled { busy = false; return }

        if full.trimmingCharacters(in: .whitespaces).isEmpty, let reason {
            errorText = errorCopy(reason)
        }

        let (reply, cards, autos) = splitProposals(full)
        var content = reply.isEmpty ? "Sorry — I didn't catch that. Please send it again." : reply
        // Parity with Chat.tsx: if Vyom claims it saved something (and the user asked it to) but no
        // actionable proposal came back, say so instead of a silent false "Logged".
        if cards.isEmpty, autos.isEmpty, claimsUnsavedAction(userMessage: message, reply: reply) {
            content += "\n\n⚠️ I didn't actually save that — please send your message again."
        }
        if assistantIndex < messages.count {
            messages[assistantIndex].content = content
            messages[assistantIndex].provider = provider
        }
        for json in autos { onApply?(json, UUID().uuidString) }   // 'remember' — silent (no card)
        proposals = cards
        onPersist?("jarvis", content, provider, nil)
        busy = false
    }

    /// Clear the on-screen conversation (a fresh thread; web keeps memory/instructions).
    func reset() {
        stopThinking()
        messages = []; proposals = []; input = ""; errorText = nil; busy = false; activeThreadId = nil
    }

    // MARK: Proposal apply

    func apply(_ p: Proposal) {
        guard let i = proposals.firstIndex(of: p) else { return }
        // Optimistic: the web write almost always succeeds (the action is applied the moment it's
        // tapped), so show "Applied" immediately — the round-trip result only DOWNGRADES to an
        // error if the web actually reports failure. This keeps the card from ever sticking.
        proposals[i].state = .applied
        onApply?(p.json, p.id.uuidString)
    }

    /// Called (through the plugin) once the web layer has actually applied the action —
    /// only used to surface a genuine failure (success is already shown optimistically).
    func applyResult(id: String, ok: Bool) {
        guard !ok, let i = proposals.firstIndex(where: { $0.id.uuidString == id }) else { return }
        proposals[i].state = .error
    }

    func dismiss(_ p: Proposal) {
        guard let i = proposals.firstIndex(of: p) else { return }
        proposals[i].state = .dismissed
    }

    // MARK: Streaming

    private struct StreamResult { var provider: String?; var reason: String? }

    private func stream(message: String, history: [[String: String]], media: [[String: String]],
                        onChunk: @escaping (String) -> Void) async -> StreamResult {
        guard let token = await freshToken() else { return StreamResult(reason: "not_authenticated") }
        guard let url = URL(string: chatURL) else { return StreamResult(reason: "not_configured") }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.httpBody = try? JSONSerialization.data(withJSONObject: [
            "system": system, "message": message, "history": history, "media": media,
        ])

        do {
            let (bytes, resp) = try await URLSession.shared.bytes(for: req)
            let http = resp as? HTTPURLResponse
            let provider = http?.value(forHTTPHeaderField: "X-Jarvis-Provider")
            if let code = http?.statusCode, !(200..<300).contains(code) {
                // Prefer the Worker's classified reason (rate_limit / overloaded) over the raw
                // code — mirrors jarvisClient.ts so the rate-limit copy shows on iOS too.
                var body = Data()
                for try await byte in bytes { body.append(byte) }
                var reason = "http_\(code)"
                if let obj = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
                   let r = obj["reason"] as? String { reason = r }
                return StreamResult(provider: provider, reason: reason)
            }
            for try await line in bytes.lines {
                let t = line.trimmingCharacters(in: .whitespaces)
                guard t.hasPrefix("data:") else { continue }
                let js = String(t.dropFirst(5)).trimmingCharacters(in: .whitespaces)
                guard let d = js.data(using: .utf8),
                      let obj = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { continue }
                if let chunk = obj["chunk"] as? String { onChunk(chunk) }
                if let err = obj["error"] as? String { return StreamResult(provider: provider, reason: err) }
            }
            return StreamResult(provider: provider, reason: nil)
        } catch {
            return StreamResult(reason: "upstream")
        }
    }

    private var chatURL: String { jarvisUrl.hasSuffix("/") ? jarvisUrl + "chat" : jarvisUrl + "/chat" }

    private func freshToken() async -> String? {
        guard let user = Auth.auth().currentUser else { return nil }
        return try? await user.getIDToken()
    }

    /// Last 10 turns, proposals stripped, empties dropped (Chat.tsx:step 3).
    /// Drops the LAST TWO messages — the empty assistant placeholder AND the current user message,
    /// which is sent separately as `message`. (Web builds history before appending the new message;
    /// we append first, so we must exclude both here — otherwise the current turn is duplicated,
    /// giving the model two identical user turns in a row and breaking terse replies like "4".)
    private func historyPayload() -> [[String: String]] {
        let turns = messages.dropLast(2)
            .map { m -> [String: String] in
                let role = m.role == .user ? "user" : "jarvis"
                return ["role": role, "content": prose(m.content)]
            }
            .filter { !($0["content"] ?? "").trimmingCharacters(in: .whitespaces).isEmpty }
        return Array(turns.suffix(10))
    }

    /// Parity with Chat.tsx: true when Vyom's prose CLAIMS it saved something the user actually
    /// asked to save, yet no action came back — so we can warn instead of showing a false "Logged".
    /// Only a positive, completed claim counts (not a question, negation, or "want me to…?" offer).
    private func claimsUnsavedAction(userMessage: String, reply: String) -> Bool {
        func matches(_ s: String, _ pattern: String) -> Bool {
            s.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil
        }
        let userWantsAction = matches(userMessage, "\\b(log|save|record|remember|set|update|change|rename|archive|delete|create|track|note)\\b")
        guard userWantsAction else { return false }
        let claims = matches(reply, "\\b(logged|saved|recorded|updated|added|created|noted|done)\\b")
        guard claims, !reply.contains("?") else { return false }
        let negationOrOffer = matches(reply, "\\b(haven'?t|hasn'?t|didn'?t|don'?t|won'?t|can'?t|cannot|if you|want me to|would you|shall i|like me to|need)\\b")
        return !negationOrOffer
    }

    // MARK: Thinking phrases

    private func startThinking() {
        thinkingTimer?.invalidate()
        var i = 0
        thinking = phrases[0]
        thinkingTimer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                i = (i + 1) % self.phrases.count
                self.thinking = self.phrases[i]
            }
        }
    }
    private func stopThinking() {
        thinkingTimer?.invalidate(); thinkingTimer = nil
        if thinking != nil { thinking = nil }
    }

    // MARK: Proposal parsing (display-only split; web validates/applies)

    private let sentinel = "===PROPOSALS==="

    private func prose(_ full: String) -> String {
        if let r = full.range(of: sentinel) { return String(full[..<r.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines) }
        return full
    }

    private func splitProposals(_ full: String) -> (String, [Proposal], [String]) {
        guard let r = full.range(of: sentinel) else { return (full.trimmingCharacters(in: .whitespacesAndNewlines), [], []) }
        let reply = String(full[..<r.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
        let jsonStr = String(full[r.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
        let parsed = parseArray(jsonStr)
        var cards: [Proposal] = []
        var autos: [String] = []
        for a in parsed {
            let kind = (a["kind"] as? String) ?? ""
            if kind.isEmpty { continue }
            guard let data = try? JSONSerialization.data(withJSONObject: a),
                  let json = String(data: data, encoding: .utf8) else { continue }
            if kind == "remember" { autos.append(json); continue }
            let summary = (a["summary"] as? String) ?? kind
            cards.append(Proposal(summary: summary, json: json))
        }
        return (reply, cards, autos)
    }

    /// The worker may emit a JSON array OR a single object.
    private func parseArray(_ s: String) -> [[String: Any]] {
        guard let d = s.data(using: .utf8), let obj = try? JSONSerialization.jsonObject(with: d) else { return [] }
        if let arr = obj as? [[String: Any]] { return arr }
        if let one = obj as? [String: Any] { return [one] }
        return []
    }

    // MARK: Error copy (verbatim from Chat.tsx:47-60)

    private func errorCopy(_ code: String) -> String {
        switch code {
        case "rate_limit":
            return "You've hit the free Gemini limit. Wait ~30-60s and tap send again. If it keeps failing, today's free quota is used up - it resets at midnight US-Pacific (~12:30 PM IST)."
        case "overloaded":
            return "Gemini is briefly overloaded (not you). Try again in a few seconds."
        case "not_configured":
            return "Vyom isn't configured - VITE_JARVIS_URL is missing."
        case "not_authenticated":
            return "Session expired - please sign in again."
        default:
            return "Vyom hit a problem (\(code)). Give it a few seconds and retry."
        }
    }
}
