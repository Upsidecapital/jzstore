#import <Capacitor/Capacitor.h>

// Registers the plugin and exposes the `discover` method to JavaScript.
// The JS side calls: Capacitor.Plugins.Bonjour.discover()
CAP_PLUGIN(BonjourPlugin, "Bonjour",
    CAP_PLUGIN_METHOD(discover, CAPPluginReturnPromise);
)
