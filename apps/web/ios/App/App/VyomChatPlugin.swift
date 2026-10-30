import Foundation
import Capacitor
import SwiftUI

/// Presents the native Vyom chat over the WebView and bridges business-logic intents to the web
/// brain (single source of truth), and receives the apply RESULT back so the card shows real
/// success/failure:
///   - "vyomApply"   { action, id }              → web runs applyAction; then calls applyResult({id,ok})
///   - "vyomPersist" { role, content, provider? } → web persists the message + thread
///   - "vyomNewThread"                            → web unsets threadId
///   - "vyomClosed"                               → web closes the fallback overlay
@objc(VyomChat)
public class VyomChatPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VyomChat"
    public let jsName = "VyomChat"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setContext", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "applyResult", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pushMessage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setMemory", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setThreads", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setMessages", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setTheme", returnType: CAPPluginReturnPromise),
    ]

    private weak var presented: UIViewController?
    private var model: VyomChatModel?   // owned while presented

    @objc func open(_ call: CAPPluginCall) {
        guard let system = call.getString("system"), let jarvisUrl = call.getString("jarvisUrl") else {
            call.reject("missing system/jarvisUrl"); return
        }
        let prefill = call.getString("seed") ?? ""
        let autoSend = call.getBool("autoSend") ?? false
        let initialRaw = (call.getArray("initialMessages") as? [[String: Any]]) ?? []

        DispatchQueue.main.async { [weak self] in
            guard let self else { call.reject("no presenter"); return }
            // Present from the top-most controller so a reopen after a close never fails with
            // "already presenting" (which would leave the web fallback showing).
            var presenter = self.bridge?.viewController
            while let top = presenter?.presentedViewController { presenter = top }
            guard let presenter else { call.reject("no presenter"); return }

            let initial: [VyomChatModel.Msg] = initialRaw.compactMap { d in
                guard let content = d["content"] as? String else { return nil }
                let role: VyomChatModel.Msg.Role = (d["role"] as? String) == "user" ? .user : .assistant
                return VyomChatModel.Msg(role: role, content: content, provider: d["provider"] as? String,
                                         attachmentKind: d["attachmentKind"] as? String)
            }

            let model = VyomChatModel(system: system, jarvisUrl: jarvisUrl, prefill: prefill, initial: initial)
            model.onApply = { [weak self] json, id in
                self?.notifyListeners("vyomApply", data: ["action": json, "id": id])
            }
            model.onPersist = { [weak self] role, content, provider, attachmentKind in
                var data: [String: Any] = ["role": role, "content": content]
                if let provider { data["provider"] = provider }
                if let attachmentKind { data["attachmentKind"] = attachmentKind }
                self?.notifyListeners("vyomPersist", data: data)
            }
            model.onImportZip = { [weak self] base64, name in
                self?.notifyListeners("vyomImportZip", data: ["base64": base64, "name": name])
            }
            // Header sheets — every read/write is delegated to the web brain (same hooks, same cache).
            model.onMemoryOpen = { [weak self] in self?.notifyListeners("vyomMemoryOpen", data: [:]) }
            model.onSaveInstructions = { [weak self] text in self?.notifyListeners("vyomSaveInstructions", data: ["text": text]) }
            model.onForgetFact = { [weak self] text in self?.notifyListeners("vyomForgetFact", data: ["text": text]) }
            model.onThreadsOpen = { [weak self] in self?.notifyListeners("vyomThreadsOpen", data: [:]) }
            model.onOpenThread = { [weak self] id in self?.notifyListeners("vyomOpenThread", data: ["id": id]) }
            model.onRenameThread = { [weak self] id, title in self?.notifyListeners("vyomRenameThread", data: ["id": id, "title": title]) }
            model.onDeleteThread = { [weak self] id in self?.notifyListeners("vyomDeleteThread", data: ["id": id]) }
            self.model = model

            let view = VyomChatView(
                model: model,
                onNewThread: { [weak self] in self?.notifyListeners("vyomNewThread", data: [:]) },
                onClose: { [weak self] in
                    self?.presented?.dismiss(animated: true)
                    self?.model = nil
                    self?.notifyListeners("vyomClosed", data: [:])
                },
                autoSend: autoSend
            )
            let host = UIHostingController(rootView: view)
            // Follow the APP's own theme (not the device) — the web passes its 'sf-theme' choice.
            host.overrideUserInterfaceStyle = call.getString("theme") == "light" ? .light : .dark
            host.modalPresentationStyle = .fullScreen
            self.presented = host
            presenter.present(host, animated: true)
            call.resolve()
        }
    }

    /// Web streams in the personal context + prior thread after the screen is already on-screen,
    /// so opening is instant (no waiting on Firestore reads).
    @objc func setContext(_ call: CAPPluginCall) {
        let system = call.getString("system") ?? ""
        let raw = (call.getArray("initialMessages") as? [[String: Any]]) ?? []
        let initial: [VyomChatModel.Msg] = raw.compactMap { d in
            guard let content = d["content"] as? String else { return nil }
            let role: VyomChatModel.Msg.Role = (d["role"] as? String) == "user" ? .user : .assistant
            return VyomChatModel.Msg(role: role, content: content, provider: d["provider"] as? String,
                                     attachmentKind: d["attachmentKind"] as? String)
        }
        Task { @MainActor in self.model?.setContext(system: system, initial: initial) }
        call.resolve()
    }

    /// Web mirrors its theme toggle into the native chat (app theme, not the device).
    @objc func setTheme(_ call: CAPPluginCall) {
        let style: UIUserInterfaceStyle = call.getString("theme") == "light" ? .light : .dark
        DispatchQueue.main.async { [weak self] in
            self?.presented?.overrideUserInterfaceStyle = style
            self?.presented?.presentedViewController?.overrideUserInterfaceStyle = style
        }
        call.resolve()
    }

    /// Web pushes the memory sheet's data (standing instructions + remembered facts).
    @objc func setMemory(_ call: CAPPluginCall) {
        let instructions = call.getString("instructions") ?? ""
        let facts = (call.getArray("facts") as? [String]) ?? []
        Task { @MainActor in self.model?.setMemory(instructions: instructions, facts: facts) }
        call.resolve()
    }

    /// Web pushes the saved-conversation list for the history sheet.
    @objc func setThreads(_ call: CAPPluginCall) {
        let raw = (call.getArray("threads") as? [[String: Any]]) ?? []
        let active = call.getString("activeId")
        let list: [VyomChatModel.Thread] = raw.compactMap { d in
            guard let id = d["id"] as? String else { return nil }
            return VyomChatModel.Thread(id: id, title: (d["title"] as? String) ?? "", subtitle: (d["subtitle"] as? String) ?? "")
        }
        Task { @MainActor in self.model?.setThreads(list, activeId: active) }
        call.resolve()
    }

    /// Web replaces the transcript with a reopened thread's messages.
    @objc func setMessages(_ call: CAPPluginCall) {
        let raw = (call.getArray("initialMessages") as? [[String: Any]]) ?? []
        let msgs: [VyomChatModel.Msg] = raw.compactMap { d in
            guard let content = d["content"] as? String else { return nil }
            let role: VyomChatModel.Msg.Role = (d["role"] as? String) == "user" ? .user : .assistant
            return VyomChatModel.Msg(role: role, content: content, provider: d["provider"] as? String,
                                     attachmentKind: d["attachmentKind"] as? String)
        }
        let tid = call.getString("threadId")
        Task { @MainActor in self.model?.setMessages(msgs, threadId: tid) }
        call.resolve()
    }

    /// Web pushes a message into the transcript (e.g. Apple Health import progress + result).
    @objc func pushMessage(_ call: CAPPluginCall) {
        let content = call.getString("content") ?? ""
        let role: VyomChatModel.Msg.Role = call.getString("role") == "user" ? .user : .assistant
        Task { @MainActor in self.model?.pushMessage(role: role, content: content) }
        call.resolve()
    }

    /// Web calls this after applyAction resolves/rejects, so the card reflects the real outcome.
    @objc func applyResult(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? ""
        let ok = call.getBool("ok") ?? false
        Task { @MainActor in self.model?.applyResult(id: id, ok: ok) }
        call.resolve()
    }
}
