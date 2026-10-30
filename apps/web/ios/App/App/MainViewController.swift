import UIKit
import Capacitor

/// Capacitor bridge view controller subclass used so we can explicitly register the
/// app-target plugins. Capacitor's automatic runtime scan does not pick up app-target
/// plugins in this SPM setup, so they are registered here by hand.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(RestTimerBridge())
        bridge?.registerPluginInstance(WatchBridge())
        bridge?.registerPluginInstance(VO2MaxBridge())
        bridge?.registerPluginInstance(HealthWorkoutsBridge())
        bridge?.registerPluginInstance(VyomChatPlugin())
    }
}
