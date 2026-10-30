import SwiftUI

// MARK: Models

/// A meal the AI proposes; the user applies or declines it.
struct ProposedMeal: Equatable {
    var name: String
    var calories: Int
    var protein: Double?
    var carbs: Double?
    var fat: Double?

    var macroLine: String {
        var parts: [String] = []
        if let p = protein { parts.append("P \(Int(p))g") }
        if let c = carbs { parts.append("C \(Int(c))g") }
        if let f = fat { parts.append("F \(Int(f))g") }
        return parts.joined(separator: " · ")
    }
}

struct ChatMessage: Identifiable, Equatable {
    enum Role { case user, ai }
    let id = UUID()
    var role: Role
    var text: String
}

// MARK: Chat model (networking + apply)

/// Drives the meal chat: sends the user's text to the Seemsfit AI worker (directly, with the
/// phone-vended token), parses the proposed meal, and writes it via the Firestore REST API on
/// Apply-so the phone can stay in your pocket.
@MainActor
final class MealChatModel: ObservableObject {
    @Published var messages: [ChatMessage] = []
    @Published var pending: ProposedMeal?     // awaiting Apply/Decline
    @Published var thinking = false
    @Published var error: String?

    private let connectivity: ConnectivityManager

    init(connectivity: ConnectivityManager) { self.connectivity = connectivity }

    enum AuthError: Error { case noAuth, unauthorized }

    /// Current token, or a freshly-minted one. `refresh` forces a phone round-trip.
    private func authValue(refresh: Bool) async -> WatchAuth? {
        if !refresh, let a = connectivity.auth { return a }
        return await connectivity.requestFreshAuth() ?? connectivity.auth
    }

    /// Run a Firebase-authed call; if it 401s (token expired), refresh once and retry.
    private func withAuthRetry<T>(_ op: (WatchAuth) async throws -> T) async throws -> T {
        guard let a = await authValue(refresh: false) else {
            guard let fresh = await authValue(refresh: true) else { throw AuthError.noAuth }
            return try await op(fresh)
        }
        do { return try await op(a) }
        catch AuthError.unauthorized {
            guard let fresh = await authValue(refresh: true) else { throw AuthError.noAuth }
            return try await op(fresh)
        }
    }

    private let system = """
    You are Vyom, SeemsFit's nutrition coach on Apple Watch. The user describes a meal in plain \
    language. Estimate its nutrition, then ALWAYS reply in TWO parts:
    1) One short friendly sentence (under 18 words) with the meal and its kcal + macros.
    2) On a new line the exact token ===PROPOSALS=== then a JSON array with ONE action:
    [{"kind":"logMeal","summary":"<short>","meal":{"name":"<name>","calories":<int kcal>,"protein":<g>,"carbs":<g>,"fat":<g>}}]
    Use realistic estimates. Output nothing after the JSON.
    """

    func send(_ raw: String) {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !thinking else { return }
        messages.append(ChatMessage(role: .user, text: text))
        pending = nil
        error = nil
        thinking = true
        Task { await ask(text) }
    }

    private func ask(_ text: String) async {
        do {
            let full = try await withAuthRetry { try await self.callWorker(text, $0) }
            let (reply, meal) = splitProposal(full)
            messages.append(ChatMessage(role: .ai, text: reply.isEmpty ? "Here's my estimate." : reply))
            pending = meal
        } catch MealChatModel.AuthError.noAuth {
            self.error = "Open SeemsFit on your phone once to reconnect Vyom."
        } catch {
            self.error = "Couldn't reach Vyom - make sure your phone's nearby."
        }
        thinking = false
    }

    /// POST to the Jarvis worker; it streams SSE, so we read the whole body then reassemble.
    private func callWorker(_ message: String, _ auth: WatchAuth) async throws -> String {
        guard let url = URL(string: auth.jarvisUrl.hasSuffix("/") ? auth.jarvisUrl + "chat" : auth.jarvisUrl + "/chat") else {
            throw URLError(.badURL)
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 25   // fail fast rather than spin if the worker stalls
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(auth.token)", forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONSerialization.data(withJSONObject: [
            "system": system, "message": message, "history": [], "media": [],
        ])
        let (data, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        if code == 401 || code == 403 { throw AuthError.unauthorized }
        guard (200..<300).contains(code) else { throw URLError(.badServerResponse) }
        return reassembleSSE(String(data: data, encoding: .utf8) ?? "")
    }

    /// SSE frames look like `data: {"chunk":"..."}` separated by blank lines-concat the chunks.
    private func reassembleSSE(_ raw: String) -> String {
        var out = ""
        for line in raw.components(separatedBy: "\n") {
            let t = line.trimmingCharacters(in: .whitespaces)
            guard t.hasPrefix("data:") else { continue }
            let json = String(t.dropFirst(5)).trimmingCharacters(in: .whitespaces)
            guard let d = json.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { continue }
            if let chunk = obj["chunk"] as? String { out += chunk }
        }
        // Some deployments return a plain (non-SSE) body-fall back to it.
        return out.isEmpty ? raw : out
    }

    /// Split prose from the ===PROPOSALS=== JSON and pull the first logMeal action.
    private func splitProposal(_ text: String) -> (String, ProposedMeal?) {
        let sentinel = "===PROPOSALS==="
        guard let r = text.range(of: sentinel) else { return (text.trimmingCharacters(in: .whitespacesAndNewlines), nil) }
        let reply = String(text[..<r.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
        let jsonStr = String(text[r.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
        guard let d = jsonStr.data(using: .utf8),
              let arr = try? JSONSerialization.jsonObject(with: d) as? [[String: Any]] else { return (reply, nil) }
        for a in arr where (a["kind"] as? String) == "logMeal" {
            guard let m = a["meal"] as? [String: Any], let name = m["name"] as? String else { continue }
            let cals = (m["calories"] as? NSNumber)?.intValue ?? 0
            func g(_ k: String) -> Double? { (m[k] as? NSNumber)?.doubleValue }
            return (reply, ProposedMeal(name: name, calories: cals, protein: g("protein"), carbs: g("carbs"), fat: g("fat")))
        }
        return (reply, nil)
    }

    // MARK: Apply

    func apply() {
        guard let meal = pending, !thinking else { return }
        thinking = true
        Task {
            do {
                try await withAuthRetry { try await self.writeMeal(meal, $0) }
                messages.append(ChatMessage(role: .ai, text: "Logged ✓ \(meal.name) · \(meal.calories) kcal"))
                pending = nil
            } catch MealChatModel.AuthError.noAuth {
                self.error = "Open SeemsFit on your phone once to reconnect Vyom."
            } catch {
                self.error = "Couldn't save - phone unreachable. Make sure your phone's nearby."
            }
            thinking = false
        }
    }

    func decline() { pending = nil }

    /// Create the meal doc via Firestore's REST API (Bearer = the vended Firebase ID token).
    private func writeMeal(_ meal: ProposedMeal, _ auth: WatchAuth) async throws {
        let path = "https://firestore.googleapis.com/v1/projects/\(auth.projectId)/databases/(default)/documents/users/\(auth.uid)/meals"
        guard let url = URL(string: path) else { throw URLError(.badURL) }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 20
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(auth.token)", forHTTPHeaderField: "Authorization")

        let df = DateFormatter(); df.dateFormat = "yyyy-MM-dd"
        var fields: [String: Any] = [
            "date": ["stringValue": df.string(from: Date())],
            "name": ["stringValue": meal.name],
            "calories": ["integerValue": String(meal.calories)],
            "estimated": ["booleanValue": true],
            "source": ["stringValue": "jarvis"],
            "createdAt": ["timestampValue": ISO8601DateFormatter().string(from: Date())],
        ]
        if let p = meal.protein { fields["protein"] = ["doubleValue": p] }
        if let c = meal.carbs { fields["carbs"] = ["doubleValue": c] }
        if let f = meal.fat { fields["fat"] = ["doubleValue": f] }
        req.httpBody = try JSONSerialization.data(withJSONObject: ["fields": fields])

        let (_, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        if code == 401 || code == 403 { throw AuthError.unauthorized }
        guard (200..<300).contains(code) else { throw URLError(.badServerResponse) }
    }
}

// MARK: View

/// iMessage-style meal chat: type (Scribble) or speak (dictation) → AI estimate → Apply/Decline.
struct MealChatView: View {
    @StateObject private var model: MealChatModel
    private let initialText: String
    @State private var seeded = false

    init(connectivity: ConnectivityManager, initialText: String = "") {
        _model = StateObject(wrappedValue: MealChatModel(connectivity: connectivity))
        self.initialText = initialText
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    if model.messages.isEmpty {
                        Text("Tap the bar below, then type or speak your meal.")
                            .font(.system(size: 12)).foregroundStyle(.secondary)
                            .padding(.top, 4)
                    }
                    ForEach(model.messages) { m in bubble(m) }
                    if model.thinking { thinkingBubble }
                    if let meal = model.pending { proposalCard(meal) }
                    if let err = model.error {
                        Text(err).font(.system(size: 11)).foregroundStyle(Band.bad)
                    }
                    inputRow
                        .id("input")
                }
                .padding(.horizontal, 4)
            }
            .onChange(of: model.messages.count) { _, _ in withAnimation { proxy.scrollTo("input", anchor: .bottom) } }
            .onChange(of: model.pending) { _, _ in withAnimation { proxy.scrollTo("input", anchor: .bottom) } }
        }
        .navigationTitle("Log meal")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            // Auto-send the words spoken/typed on the Today row so this screen opens straight into
            // Vyom's estimate — no need to re-enter the meal here.
            guard !seeded else { return }
            seeded = true
            let t = initialText.trimmingCharacters(in: .whitespacesAndNewlines)
            if !t.isEmpty { model.send(t) }
        }
    }

    private func bubble(_ m: ChatMessage) -> some View {
        HStack {
            if m.role == .user { Spacer(minLength: 24) }
            Text(m.text)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(m.role == .user ? .white : .primary)
                .padding(.horizontal, 10).padding(.vertical, 7)
                .background(m.role == .user ? Band.energy : Color.white.opacity(0.14),
                            in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            if m.role == .ai { Spacer(minLength: 24) }
        }
    }

    private var thinkingBubble: some View {
        HStack {
            ProgressView().scaleEffect(0.7)
            Text("thinking…").font(.system(size: 12)).foregroundStyle(.secondary)
            Spacer()
        }
    }

    private func proposalCard(_ meal: ProposedMeal) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(meal.name).font(.system(size: 14, weight: .bold)).lineLimit(2)
            Text("\(meal.calories) kcal\(meal.macroLine.isEmpty ? "" : " · \(meal.macroLine)")")
                .font(.system(size: 11)).foregroundStyle(.secondary)
            HStack(spacing: 6) {
                Button { model.apply() } label: {
                    Text("Apply").font(.system(size: 13, weight: .bold)).foregroundStyle(.black)
                        .frame(maxWidth: .infinity).padding(.vertical, 6)
                        .background(Band.good, in: Capsule())
                }.buttonStyle(.plain)
                Button { model.decline() } label: {
                    Text("Decline").font(.system(size: 13, weight: .semibold))
                        .frame(maxWidth: .infinity).padding(.vertical, 6)
                        .background(Color.white.opacity(0.16), in: Capsule())
                }.buttonStyle(.plain)
            }
        }
        .padding(10)
        .background(Color.white.opacity(0.10), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    // watchOS has no Speech framework / no "mic-only" API, so the system input controller (via
    // TextFieldLink) is the only dictation path: tap the bar → it offers Dictation, Scribble and
    // the keyboard. onSubmit gives the finished string, sent straight to Vyom.
    private var inputRow: some View {
        TextFieldLink(prompt: Text("Describe your meal")) {
            HStack(spacing: 8) {
                Image(systemName: "mic.fill").font(.system(size: 15, weight: .bold)).foregroundStyle(Band.energy)
                Text("Type or speak…").font(.system(size: 13)).foregroundStyle(.secondary)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(Color.white.opacity(0.12), in: Capsule())
        } onSubmit: { text in
            model.send(text)
        }
        .buttonStyle(.plain)
        .disabled(model.thinking)
        .padding(.top, 4)
    }
}
