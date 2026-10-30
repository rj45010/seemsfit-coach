import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

// The single native accent knob — change this one line to re-theme every native button/tint.
// Mirrors the web `--color-accent` and the watch `Band.energy`.
extension Color {
    static let brand = Color(red: 0.243, green: 0.486, blue: 0.376) // muted forest green (matches web --color-accent)
    // Warm cream theme — mirrors globals.css so Vyom sits with the rest of the app, not brighter.
    static let vyomPaper = Color(red: 0.945, green: 0.914, blue: 0.847)   // --color-paper  (#f1e9d8) page cream
    static let vyomSurface = Color(red: 0.984, green: 0.961, blue: 0.918) // --color-surface (#fbf5ea) card cream
}

/// Native Vyom chat screen. Presentation + keyboard only; the model streams and everything with
/// business logic is delegated to the web brain. SwiftUI keeps the input glued to the keyboard.
struct VyomChatView: View {
    @ObservedObject var model: VyomChatModel
    let onNewThread: () -> Void
    let onClose: () -> Void
    let autoSend: Bool

    // Attachment pickers (the `+` button).
    @State private var showSourceMenu = false
    @State private var showPhotos = false
    @State private var photoItem: PhotosPickerItem?
    @State private var showFiles = false
    @State private var showCamera = false

    // Memory editor (sheet) + the ChatGPT/Gemini-style left slide-over drawer.
    @State private var showMemory = false
    @State private var showDrawer = false

    // Verbatim from Chat.tsx:21-26.
    private let quickActions = [
        "Give me my weekly review",
        "How was my recovery this week?",
        "Plan today's session",
        "Progress my plan for next week",
    ]

    private var isEmpty: Bool {
        model.messages.isEmpty && model.thinking == nil && model.proposals.isEmpty && model.errorText == nil
    }

    var body: some View {
        GeometryReader { geo in
            let drawerWidth = min(geo.size.width * 0.70, 300)
            ZStack(alignment: .leading) {
                // Cream backdrop: fills the whole screen so the chat card's rounded corners reveal
                // theme colour (not a gap), and the status/home areas stay themed when it's clipped.
                Color.vyomPaper.ignoresSafeArea()

                // The menu sits BEHIND the chat and slides in from the left (ChatGPT style).
                VyomDrawer(
                    model: model,
                    onNew: { model.reset(); onNewThread(); withAnimation(drawerSpring) { showDrawer = false } },
                    onOpenMemory: { model.onMemoryOpen?(); showMemory = true },
                    onClose: { withAnimation(drawerSpring) { showDrawer = false } }
                )
                .frame(width: drawerWidth)
                .offset(x: showDrawer ? 0 : -drawerWidth - 24)

                // The chat becomes a rounded, scaled-down card that slides right to reveal the menu;
                // tapping the dimmed card closes it. Its own layout (header, keyboard) is untouched.
                chatSurface
                    .overlay {
                        if showDrawer {
                            Color.black.opacity(0.12).ignoresSafeArea()
                                .contentShape(Rectangle())
                                .onTapGesture { withAnimation(drawerSpring) { showDrawer = false } }
                        }
                    }
                    // Rounds ONLY when the drawer is open; when closed it doesn't clip at all, so the
                    // chat keeps its full-bleed edges (no seam/line where the clip met the backdrop).
                    .clipShape(CardClip(radius: showDrawer ? 34 : 0))
                    .shadow(color: .black.opacity(showDrawer ? 0.22 : 0), radius: 22, x: -8, y: 0)
                    .scaleEffect(showDrawer ? 0.9 : 1, anchor: .center)
                    .offset(x: showDrawer ? drawerWidth : 0)
            }
            .animation(drawerSpring, value: showDrawer)
        }
        .sheet(isPresented: $showMemory) { VyomMemorySheet(model: model) }
        .onAppear { if autoSend { model.requestAutoSend() } }
    }

    private var drawerSpring: Animation { .spring(response: 0.4, dampingFraction: 0.86) }

    /// The chat screen proper (background glow + transcript + input), with the translucent header
    /// pinned on top. Extracted so the drawer can slide it aside.
    private var chatSurface: some View {
        ZStack(alignment: .top) {
            // Warm cream base (same as the rest of the app, so it isn't glaringly bright) + a soft
            // green ambient glow confined to the TOP so the chat stays readable below.
            Color.vyomPaper.ignoresSafeArea()
            LinearGradient(
                colors: [Color.brand.opacity(0.20), .clear],
                startPoint: .top, endPoint: .bottom
            )
            .frame(height: 300)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .ignoresSafeArea(edges: .top)
            .allowsHitTesting(false)

            VStack(spacing: 0) {
                if isEmpty {
                    // Fresh chat — center the prompt + quick actions (not pinned to the top).
                    VStack { Spacer(minLength: 0); emptyState; Spacer(minLength: 0) }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .padding(.horizontal, 16)
                        .contentShape(Rectangle())
                        .onTapGesture { hideKeyboard() }
                } else {
                    transcript
                }
                inputBar
            }
            // The translucent header floats above the transcript; chat content scrolls UNDER it
            // (like the web greeting header) so it reads as a bar over the page, not part of it.
            .safeAreaInset(edge: .top, spacing: 0) { header }
        }
    }

    private var header: some View {
        HStack(spacing: 10) {
            // Hamburger → chat history + memory live in the drawer (like ChatGPT/Gemini).
            headerButton("line.3.horizontal") { model.onThreadsOpen?(); withAnimation(drawerSpring) { showDrawer = true } }
            Text("Vyom").font(.title3.bold())
            Spacer()
            headerButton("square.and.pencil") { model.reset(); onNewThread() }
            headerButton("xmark", action: onClose)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        // Solid cream bar (same paper as the status-bar backdrop, so the two never mismatch once the
        // chat is clipped into a card); a soft drop shadow keeps the chat reading as UNDER the header.
        .background {
            Color.vyomPaper
                .ignoresSafeArea(edges: .top)
                .shadow(color: .black.opacity(0.08), radius: 7, y: 3)
        }
        .overlay(alignment: .bottom) {
            Rectangle().fill(Color.black.opacity(0.08)).frame(height: 0.5)
        }
    }

    private func headerButton(_ icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: 19, weight: .semibold)).foregroundStyle(Color.brand)
                .frame(width: 44, height: 44)
                .background(Color(.secondarySystemBackground), in: Circle())
                .overlay(Circle().strokeBorder(Color.black.opacity(0.12), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private var transcript: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    // Skip the empty assistant placeholder while streaming — the thinking row is
                    // the only indicator, so we don't show a "…" bubble AND a thinking line.
                    ForEach(model.messages) { m in
                        if !(m.role == .assistant && m.content.isEmpty) { bubble(m) }
                    }
                    if let t = model.thinking { thinkingRow(t) }
                    ForEach(model.proposals) { p in proposalCard(p) }
                    if let e = model.errorText {
                        Text(e).font(.footnote).foregroundStyle(.red)
                            .frame(maxWidth: .infinity, alignment: .center)
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(.horizontal, 12).padding(.vertical, 10)
            }
            .scrollDismissesKeyboard(.interactively)
            .simultaneousGesture(TapGesture().onEnded { hideKeyboard() })  // tap chat area = collapse keyboard
            .onAppear { jumpToBottom(proxy) }
            // History arrives asynchronously via setContext — jump again once it populates.
            .onChange(of: model.messages.count) { _ in jumpToBottom(proxy) }
            .onChange(of: model.messages.last?.content) { _ in scroll(proxy) }
            .onChange(of: model.thinking) { _ in scroll(proxy) }
            .onChange(of: model.proposals.count) { _ in scroll(proxy) }
        }
    }

    private func scroll(_ proxy: ScrollViewProxy) { withAnimation { proxy.scrollTo("bottom", anchor: .bottom) } }

    /// Jump to the very bottom without animation, retried across a few frames — a lazy list's
    /// rows only get their true height as they render, so a single scroll lands short.
    private func jumpToBottom(_ proxy: ScrollViewProxy) {
        for delay in [0.0, 0.1, 0.3, 0.5] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                proxy.scrollTo("bottom", anchor: .bottom)
            }
        }
    }

    private func hideKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Ask me anything about your training, recovery or nutrition.")
                .font(.callout).foregroundStyle(.secondary)
            ForEach(quickActions, id: \.self) { q in
                Button { model.send(q) } label: {
                    Text(q).font(.subheadline.weight(.medium)).foregroundStyle(.primary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 12).padding(.vertical, 10)
                        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.top, 4)
    }

    @ViewBuilder
    private func bubble(_ m: VyomChatModel.Msg) -> some View {
        if m.role == .user {
            // Live session keeps the real image (base64 in memory); a reloaded thread only knows
            // the KIND, so it shows a chip instead — either way the attachment reads as part of the
            // message, like a typical AI chat.
            let liveImage: UIImage? = (m.attachment?.kind == .image) ? m.attachment.flatMap(decodeImage) : nil
            let chipKind: String? = liveImage == nil ? (m.attachment?.wireKind ?? m.attachmentKind) : nil
            HStack {
                Spacer(minLength: 44)
                VStack(alignment: .trailing, spacing: 6) {
                    if let ui = liveImage {
                        Image(uiImage: ui).resizable().scaledToFill()
                            .frame(maxWidth: 220, maxHeight: 240)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                    if chipKind != nil || !m.content.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            if let kind = chipKind { attachmentChip(kind) }
                            if !m.content.isEmpty {
                                Text(rendered(m.content)).font(.callout).foregroundStyle(Color.white)
                            }
                        }
                        .padding(.horizontal, 12).padding(.vertical, 9)
                        .background(Color.brand, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                    if !m.content.isEmpty { CopyButton(text: m.content) }
                }
            }
        } else {
            // Vyom's reply is full-width editorial text on the background — no bubble, with a
            // "VYOM · time" label above — so it reads as a coach talking, not a chat bubble.
            VStack(alignment: .leading, spacing: 4) {
                Text("VYOM · \(timeString(m.at))")
                    .font(.caption2.weight(.bold)).foregroundStyle(.tertiary)
                Text(rendered(m.content))
                    .font(.callout).foregroundStyle(.primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if !m.content.isEmpty { CopyButton(text: m.content) }
            }
        }
    }

    private func decodeImage(_ att: VyomChatModel.Pending) -> UIImage? {
        guard let data = Data(base64Encoded: att.base64) else { return nil }
        return UIImage(data: data)
    }

    /// A small on-brand file-card that sits inside the green bubble — an accent-tinted icon tile
    /// plus a label (mirrors the Health cards' iconography). Used for non-image attachments and for
    /// any attachment on a reopened thread (where only the kind is known).
    private func attachmentChip(_ kind: String) -> some View {
        let glyph: AttachmentGlyph.Kind
        let label: String
        switch kind {
        case "video": glyph = .video; label = "Video"
        case "pdf": glyph = .pdf; label = "Document"
        default: glyph = .image; label = "Photo"
        }
        return HStack(spacing: 9) {
            ZStack {
                RoundedRectangle(cornerRadius: 9, style: .continuous).fill(Color.brand.opacity(0.16))
                AttachmentGlyph(kind: glyph, size: 18, color: .brand)
            }
            .frame(width: 32, height: 32)
            Text(label).font(.footnote.weight(.semibold)).foregroundStyle(Color(red: 0.133, green: 0.110, blue: 0.078))
            Spacer(minLength: 4)
        }
        .padding(6).padding(.trailing, 12)
        .frame(minWidth: 150, alignment: .leading)
        .background(Color.vyomSurface, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
    }

    private func thinkingRow(_ text: String) -> some View {
        HStack(spacing: 6) {
            ProgressView().controlSize(.small)
            Text(text).font(.footnote).foregroundStyle(.secondary)
            Spacer()
        }
        .transition(.opacity)
    }

    private func proposalCard(_ p: VyomChatModel.Proposal) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(p.summary).font(.subheadline.weight(.semibold))
            switch p.state {
            case .applied: Label("Applied", systemImage: "checkmark.circle.fill").font(.footnote.bold()).foregroundStyle(.green)
            case .dismissed: Text("Dismissed").font(.footnote).foregroundStyle(.secondary)
            case .error: Text("Couldn't apply — try again.").font(.footnote).foregroundStyle(.red)
            default:
                HStack(spacing: 8) {
                    Button { model.apply(p) } label: {
                        Text(p.state == .applying ? "Applying…" : "Apply").font(.subheadline.bold()).foregroundStyle(.white)
                            .frame(maxWidth: .infinity).padding(.vertical, 8)
                            .background(Color.brand, in: Capsule())
                    }
                    .buttonStyle(.plain).disabled(p.state == .applying)
                    Button { model.dismiss(p) } label: {
                        Text("Dismiss").font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity).padding(.vertical, 8)
                            .background(Color(.tertiarySystemBackground), in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(12)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var inputBar: some View {
        VStack(spacing: 8) {
            if let p = model.pending { attachmentPreview(p) }
            // A single tall rounded pill (like ChatGPT / Gemini): + · text · send.
            HStack(spacing: 10) {
                Button { showSourceMenu = true } label: {
                    Image(systemName: "plus").font(.system(size: 21, weight: .semibold)).foregroundStyle(.secondary)
                        .frame(width: 36, height: 36)
                }
                .buttonStyle(.plain).disabled(model.busy)
                TextField("Ask Vyom…", text: $model.input, axis: .vertical)
                    .lineLimit(1...5)
                    .textFieldStyle(.plain)
                    .padding(.vertical, 10)
                // While a reply streams this becomes a Stop button (no new send until it's done).
                Button { model.busy ? model.stop() : model.send() } label: {
                    Image(systemName: model.busy ? "stop.fill" : "arrow.up")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(model.busy ? Color(.systemBackground) : Color.white)
                        .frame(width: 38, height: 38)
                        .background(model.busy ? Color.primary : Color.brand, in: Circle())
                }
                .buttonStyle(.plain)
                .disabled(!model.busy && model.input.trimmingCharacters(in: .whitespaces).isEmpty && model.pending == nil)
            }
            .padding(.leading, 8).padding(.trailing, 7).padding(.vertical, 6)
            .background(Color.vyomSurface, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).strokeBorder(Color.black.opacity(0.14), lineWidth: 1))
            .shadow(color: Color.black.opacity(0.06), radius: 9, y: 2)
        }
        .padding(.horizontal, 12).padding(.top, 6).padding(.bottom, 8)
        // Sit the pill on the same warm cream base as the chat.
        .background(Color.vyomPaper.ignoresSafeArea(edges: .bottom))
        .confirmationDialog("Add attachment", isPresented: $showSourceMenu, titleVisibility: .visible) {
            Button("Photo Library") { showPhotos = true }
            Button("Take Photo") { showCamera = true }
            Button("Files") { showFiles = true }
            Button("Cancel", role: .cancel) {}
        }
        .photosPicker(isPresented: $showPhotos, selection: $photoItem, matching: .any(of: [.images, .videos]))
        .onChange(of: photoItem) { _ in loadPhoto() }
        .fileImporter(isPresented: $showFiles, allowedContentTypes: [.pdf, .image, .zip], allowsMultipleSelection: false) { handleFile($0) }
        .fullScreenCover(isPresented: $showCamera) { CameraPicker { handleCamera($0) }.ignoresSafeArea() }
    }

    private func attachmentPreview(_ p: VyomChatModel.Pending) -> some View {
        HStack(spacing: 10) {
            Image(systemName: p.kind == .pdf ? "doc.text.fill" : p.kind == .video ? "video.fill" : "photo.fill")
                .foregroundStyle(.secondary)
            Text(p.name).font(.footnote.weight(.medium)).lineLimit(1)
            Spacer()
            Button { model.pending = nil } label: {
                Image(systemName: "xmark.circle.fill").font(.system(size: 18)).foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    // MARK: Attachment loading

    private func loadPhoto() {
        guard let item = photoItem else { return }
        Task {
            guard let data = try? await item.loadTransferable(type: Data.self) else { return }
            let type = item.supportedContentTypes.first
            let isVideo = type?.conforms(to: .movie) ?? false
            let mime = type?.preferredMIMEType ?? (isVideo ? "video/quicktime" : "image/jpeg")
            let ext = type?.preferredFilenameExtension ?? (isVideo ? "mov" : "jpg")
            await MainActor.run {
                model.pending = .init(base64: data.base64EncodedString(), mimeType: mime,
                                      kind: isVideo ? .video : .image, name: "attachment.\(ext)")
                photoItem = nil
            }
        }
    }

    private func handleFile(_ result: Result<[URL], Error>) {
        guard case .success(let urls) = result, let url = urls.first else { return }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else { return }
        let name = url.lastPathComponent
        let ext = url.pathExtension.lowercased()
        if ext == "zip" {
            // Apple Health export → hand to the web importer (importHaeZip lives there).
            model.onImportZip?(data.base64EncodedString(), name)
            return
        }
        let mime: String
        let kind: VyomChatModel.Pending.Kind
        if ext == "pdf" {
            mime = "application/pdf"; kind = .pdf
        } else {
            let ut = UTType(filenameExtension: ext)
            mime = ut?.preferredMIMEType ?? "image/jpeg"
            kind = (ut?.conforms(to: .movie) ?? false) ? .video : .image
        }
        model.pending = .init(base64: data.base64EncodedString(), mimeType: mime, kind: kind, name: name)
    }

    private func handleCamera(_ image: UIImage?) {
        showCamera = false
        guard let image, let data = image.jpegData(compressionQuality: 0.8) else { return }
        model.pending = .init(base64: data.base64EncodedString(), mimeType: "image/jpeg", kind: .image, name: "photo.jpg")
    }

    // MARK: helpers

    private func rendered(_ s: String) -> AttributedString {
        if s.isEmpty { return AttributedString("…") }
        if let a = try? AttributedString(markdown: s, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)) {
            return a
        }
        return AttributedString(s)
    }

    private func timeString(_ d: Date) -> String {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "h:mm a"
        return f.string(from: d)
    }
}

/// Vyom's brain: standing instructions (applied every reply) + remembered facts. All reads/writes
/// are delegated to the web brain via the model callbacks (same Firestore doc as the web sheet).
struct VyomMemorySheet: View {
    @ObservedObject var model: VyomChatModel
    @Environment(\.dismiss) private var dismiss
    @State private var instructions = ""
    @State private var dirty = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    TextField("Add standing instructions for Vyom…", text: $instructions, axis: .vertical)
                        .lineLimit(3...8)
                        .onChange(of: instructions) { _ in dirty = true }
                    if dirty {
                        Button("Save instructions") {
                            model.onSaveInstructions?(instructions.trimmingCharacters(in: .whitespacesAndNewlines))
                            dirty = false
                        }
                        .font(.body.weight(.semibold))
                    }
                } header: {
                    Text("Your instructions")
                } footer: {
                    Text("Applied to every reply — e.g. \"be blunt\", \"keep it short\", \"I'm vegetarian\", \"use kg\".")
                }

                Section("What Vyom remembers") {
                    if !model.memoryLoaded {
                        HStack(spacing: 8) { ProgressView(); Text("Loading…").foregroundStyle(.secondary) }
                    } else if model.memoryFacts.isEmpty {
                        Text("Nothing yet. Tell Vyom something durable — \"my left knee gets sore on squats\" — and it'll keep it here and work around it.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(model.memoryFacts) { fact in Text(fact.text) }
                            .onDelete { idx in idx.forEach { model.onForgetFact?(model.memoryFacts[$0].text) } }
                    }
                }
            }
            .navigationTitle("Vyom memory")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .navigationBarTrailing) { Button("Done") { dismiss() } } }
            .tint(Color.brand)
            .onAppear { instructions = model.memoryInstructions }
            .onChange(of: model.memoryInstructions) { v in if !dirty { instructions = v } }
        }
    }
}

/// ChatGPT/Gemini-style slide-over: New chat + Vyom memory pinned at the top, then saved
/// conversations (newest first — tap to reopen, swipe to rename/delete). Everything is delegated
/// to the web brain, so the web chat's thread list stays in sync too.
struct VyomDrawer: View {
    @ObservedObject var model: VyomChatModel
    let onNew: () -> Void
    let onOpenMemory: () -> Void
    let onClose: () -> Void
    @State private var editingId: String?
    @State private var draft = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Vyom").font(.title2.bold())
                Spacer()
                Button(action: onClose) {
                    Image(systemName: "xmark").font(.system(size: 15, weight: .semibold)).foregroundStyle(.secondary)
                        .frame(width: 34, height: 34).background(Color.black.opacity(0.05), in: Circle())
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 10)

            VStack(spacing: 4) {
                drawerRow("square.and.pencil", "New chat", action: onNew)
                drawerRow("brain.head.profile", "Vyom memory", action: onOpenMemory)
            }
            .padding(.horizontal, 10)

            Text("Your chats")
                .font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                .padding(.horizontal, 18).padding(.top, 18).padding(.bottom, 2)

            if !model.threadsLoaded {
                HStack(spacing: 8) { ProgressView(); Text("Loading…").font(.footnote).foregroundStyle(.secondary) }
                    .padding(.horizontal, 18).padding(.top, 8)
                Spacer()
            } else if model.threads.isEmpty {
                Text("No saved chats yet. Start a conversation and it'll be saved here.")
                    .font(.footnote).foregroundStyle(.secondary)
                    .padding(.horizontal, 18).padding(.top, 8)
                Spacer()
            } else {
                List {
                    ForEach(model.threads) { t in threadRow(t) }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        // Full-bleed card cream — the menu sits BEHIND the chat (ChatGPT style); the chat is the
        // rounded card that slides aside to reveal it.
        .background(Color.vyomSurface.ignoresSafeArea())
        .tint(Color.brand)
    }

    private func drawerRow(_ icon: String, _ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon).font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.brand).frame(width: 22)
                Text(title).font(.body.weight(.medium)).foregroundStyle(.primary)
                Spacer()
            }
            .padding(.horizontal, 12).padding(.vertical, 12)
            .background(Color.black.opacity(0.04), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func threadRow(_ t: VyomChatModel.Thread) -> some View {
        if editingId == t.id {
            HStack {
                TextField("Title", text: $draft).textFieldStyle(.plain)
                Button {
                    let title = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !title.isEmpty { model.onRenameThread?(t.id, title) }
                    editingId = nil
                } label: { Image(systemName: "checkmark").font(.body.weight(.bold)) }
                .buttonStyle(.plain)
            }
            .listRowBackground(Color.clear)
        } else {
            Button { model.onOpenThread?(t.id); onClose() } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(t.title.isEmpty ? "Untitled chat" : t.title)
                        .font(.body.weight(.semibold)).foregroundStyle(.primary).lineLimit(1)
                    if !t.subtitle.isEmpty {
                        Text(t.subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            // Plain style so the title/subtitle keep their own ink colours instead of being
            // painted in the accent tint (which made the whole list read as blue links).
            .buttonStyle(.plain)
            .listRowBackground(t.id == model.activeThreadId ? Color.brand.opacity(0.12) : Color.clear)
            // Hairline between chats so the list doesn't read as one solid block.
            .listRowSeparator(.visible)
            .listRowSeparatorTint(Color.black.opacity(0.08))
            .swipeActions(edge: .trailing) {
                Button(role: .destructive) { model.onDeleteThread?(t.id) } label: { Label("Delete", systemImage: "trash") }
                Button { editingId = t.id; draft = t.title } label: { Label("Rename", systemImage: "pencil") }.tint(.gray)
            }
        }
    }
}

/// Small copy-to-clipboard control under each message (like every AI chat), with a brief
/// checkmark confirmation.
struct CopyButton: View {
    let text: String
    @State private var copied = false

    var body: some View {
        Button {
            UIPasteboard.general.string = text
            copied = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { copied = false }
        } label: {
            Label(copied ? "Copied" : "Copy", systemImage: copied ? "checkmark" : "doc.on.doc")
                .font(.caption2.weight(.semibold)).labelStyle(.iconOnly)
                .foregroundStyle(.tertiary)
                .frame(width: 28, height: 24)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(copied ? "Copied" : "Copy message")
    }
}

/// Clips the chat into a rounded card ONLY while the drawer is open. At radius 0 it returns an
/// oversized path so nothing is trimmed — the chat keeps its full-bleed edges (no clip seam behind
/// the status bar / input) in the normal, closed state.
struct CardClip: Shape {
    var radius: CGFloat
    var animatableData: CGFloat {
        get { radius }
        set { radius = newValue }
    }
    func path(in rect: CGRect) -> Path {
        guard radius > 0.5 else { return Path(rect.insetBy(dx: -2000, dy: -2000)) }
        return Path(roundedRect: rect, cornerRadius: radius, style: .continuous)
    }
}

/// Minimal line-art attachment glyphs (lucide-style), drawn as vectors so they sit with the app's
/// icon language instead of the heavier SF Symbols. Authored in a 24×24 box and scaled to `size`.
struct AttachmentGlyph: View {
    enum Kind { case image, video, pdf }
    let kind: Kind
    var size: CGFloat = 18
    var color: Color = .brand

    var body: some View {
        Canvas { ctx, sz in
            let s = sz.width / 24
            func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * s, y: y * s) }
            var path = Path()
            switch kind {
            case .image:
                path.addRoundedRect(in: CGRect(x: 3 * s, y: 3 * s, width: 18 * s, height: 18 * s),
                                    cornerSize: CGSize(width: 3 * s, height: 3 * s))
                path.addEllipse(in: CGRect(x: 7 * s, y: 7 * s, width: 2.8 * s, height: 2.8 * s))
                path.move(to: p(4, 18)); path.addLine(to: p(9.5, 12.5)); path.addLine(to: p(13, 16))
                path.addLine(to: p(16, 13)); path.addLine(to: p(20, 17))
            case .pdf:
                path.move(to: p(6, 3)); path.addLine(to: p(14, 3)); path.addLine(to: p(19, 8))
                path.addLine(to: p(19, 21)); path.addLine(to: p(6, 21)); path.closeSubpath()
                path.move(to: p(14, 3)); path.addLine(to: p(14, 8)); path.addLine(to: p(19, 8))
                path.move(to: p(9, 12.5)); path.addLine(to: p(16, 12.5))
                path.move(to: p(9, 15.5)); path.addLine(to: p(16, 15.5))
                path.move(to: p(9, 18.5)); path.addLine(to: p(13, 18.5))
            case .video:
                path.addRoundedRect(in: CGRect(x: 3 * s, y: 6 * s, width: 12 * s, height: 12 * s),
                                    cornerSize: CGSize(width: 3 * s, height: 3 * s))
                path.move(to: p(15, 10)); path.addLine(to: p(21, 7))
                path.addLine(to: p(21, 17)); path.addLine(to: p(15, 14)); path.closeSubpath()
            }
            ctx.stroke(path, with: .color(color),
                       style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
        }
        .frame(width: size, height: size)
    }
}

/// Take-a-photo source — UIKit's camera wrapped for SwiftUI (web can't do this).
struct CameraPicker: UIViewControllerRepresentable {
    var onImage: (UIImage?) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onImage: onImage) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onImage: (UIImage?) -> Void
        init(onImage: @escaping (UIImage?) -> Void) { self.onImage = onImage }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            onImage(info[.originalImage] as? UIImage)
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { onImage(nil) }
    }
}
