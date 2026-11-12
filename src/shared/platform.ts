/** True in the Android WebView. The shell uses it for Android-only system input and styling. */
export const isAndroid = (): boolean => /Android/i.test(navigator.userAgent);
