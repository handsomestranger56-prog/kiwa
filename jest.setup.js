// Native modules are not present under Jest. Screens that use them still load, with these stand-ins.
jest.mock('react-native-webview', () => ({ WebView: () => null }));
