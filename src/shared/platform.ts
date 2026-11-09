/** True in the Android WebView. The app's own screens use it only for Android-only system input. */
export const isAndroid = (): boolean => /Android/i.test(navigator.userAgent);
