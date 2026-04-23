import Capacitor
import Foundation

/// Discovers Mac Dock servers on the local network via Bonjour / mDNS.
/// The Mac server advertises itself as _macdock._tcp. and this plugin
/// browses for that service type, resolves the host + port, and returns
/// the first match to JavaScript.
@objc(BonjourPlugin)
public class BonjourPlugin: CAPPlugin {

    private var browser: NetServiceBrowser?
    private var pendingServices: [NetService] = []
    private var results: [[String: Any]] = []
    private var pendingCall: CAPPluginCall?
    private var timeoutTimer: Timer?

    // MARK: – Public JS-callable method

    @objc func discover(_ call: CAPPluginCall) {
        // Cancel any in-flight discovery
        stopBrowsing()

        pendingCall = call
        results = []
        pendingServices = []

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            self.browser = NetServiceBrowser()
            self.browser?.delegate = self
            self.browser?.searchForServices(ofType: "_macdock._tcp.", inDomain: "local.")

            // Resolve after 5 s if nothing found yet
            self.timeoutTimer = Timer.scheduledTimer(
                withTimeInterval: 5.0, repeats: false
            ) { [weak self] _ in
                self?.finish()
            }
        }
    }

    // MARK: – Helpers

    private func stopBrowsing() {
        timeoutTimer?.invalidate()
        timeoutTimer = nil
        browser?.stop()
        browser = nil
    }

    private func finish() {
        stopBrowsing()
        pendingCall?.resolve(["services": results])
        pendingCall = nil
    }
}

// MARK: – NetServiceBrowserDelegate

extension BonjourPlugin: NetServiceBrowserDelegate {
    public func netServiceBrowser(
        _ browser: NetServiceBrowser,
        didFind service: NetService,
        moreComing: Bool
    ) {
        service.delegate = self
        service.resolve(withTimeout: 5.0)
        pendingServices.append(service)
    }

    public func netServiceBrowser(
        _ browser: NetServiceBrowser,
        didNotSearch errorDict: [String: NSNumber]
    ) {
        finish()
    }
}

// MARK: – NetServiceDelegate

extension BonjourPlugin: NetServiceDelegate {
    public func netServiceDidResolveAddress(_ sender: NetService) {
        guard let rawHost = sender.hostName else { return }
        // Strip trailing dot that mDNS appends
        let host = rawHost.hasSuffix(".") ? String(rawHost.dropLast()) : rawHost
        let entry: [String: Any] = [
            "name": sender.name,
            "host": host,
            "port": sender.port
        ]
        results.append(entry)

        // Return as soon as we have the first resolved service
        if pendingCall != nil {
            // Small delay in case moreComing gave us a faster service
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
                self?.finish()
            }
        }
    }

    public func netService(
        _ sender: NetService,
        didNotResolve errorDict: [String: NSNumber]
    ) {
        // Nothing to do — timeout will handle the empty-result case
    }
}
