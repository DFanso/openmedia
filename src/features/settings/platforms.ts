export interface Platform {
  id: string;
  name: string;
  /** Where a favorite for this platform opens. */
  url: string;
  /** Hosts that count as this platform when checking whether it is already a favorite. */
  domains: string[];
}

/**
 * The twenty largest social platforms by monthly users, in that order. Addresses are the ones a
 * phone browser lands on without bouncing through another domain (checked with a mobile Safari
 * user agent), because a session stays pinned to the domain it settles on.
 */
export const PLATFORMS: Platform[] = [
  { id: "facebook", name: "Facebook", url: "https://www.facebook.com/", domains: ["facebook.com"] },
  {
    id: "instagram",
    name: "Instagram",
    url: "https://www.instagram.com/",
    domains: ["instagram.com"],
  },
  { id: "whatsapp", name: "WhatsApp", url: "https://web.whatsapp.com/", domains: ["whatsapp.com"] },
  { id: "youtube", name: "YouTube", url: "https://m.youtube.com/", domains: ["youtube.com"] },
  { id: "tiktok", name: "TikTok", url: "https://www.tiktok.com/", domains: ["tiktok.com"] },
  {
    id: "wechat",
    name: "WeChat",
    url: "https://web.wechat.com/",
    domains: ["wechat.com", "weixin.qq.com", "wx.qq.com"],
  },
  {
    id: "messenger",
    name: "Messenger",
    url: "https://www.messenger.com/",
    domains: ["messenger.com"],
  },
  {
    id: "telegram",
    name: "Telegram",
    url: "https://web.telegram.org/a/",
    domains: ["telegram.org", "t.me"],
  },
  { id: "snapchat", name: "Snapchat", url: "https://www.snapchat.com/", domains: ["snapchat.com"] },
  { id: "reddit", name: "Reddit", url: "https://www.reddit.com/", domains: ["reddit.com"] },
  {
    id: "kuaishou",
    name: "Kuaishou",
    url: "https://www.kuaishou.com/",
    domains: ["kuaishou.com"],
  },
  { id: "douyin", name: "Douyin", url: "https://www.douyin.com/", domains: ["douyin.com"] },
  {
    id: "qq",
    name: "QQ",
    url: "https://im.qq.com/",
    domains: ["im.qq.com", "web.qq.com", "qzone.qq.com"],
  },
  { id: "x", name: "X (Twitter)", url: "https://x.com/", domains: ["x.com", "twitter.com"] },
  {
    id: "pinterest",
    name: "Pinterest",
    url: "https://www.pinterest.com/",
    domains: ["pinterest.com"],
  },
  { id: "weibo", name: "Weibo", url: "https://m.weibo.cn/", domains: ["weibo.cn", "weibo.com"] },
  {
    id: "threads",
    name: "Threads",
    url: "https://www.threads.com/",
    domains: ["threads.com", "threads.net"],
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    url: "https://www.linkedin.com/",
    domains: ["linkedin.com"],
  },
  { id: "discord", name: "Discord", url: "https://discord.com/app", domains: ["discord.com"] },
  { id: "twitch", name: "Twitch", url: "https://m.twitch.tv/", domains: ["twitch.tv"] },
];

/** True when `url` is on one of the platform's domains or a subdomain of one. */
export function isPlatformUrl(platform: Platform, url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return platform.domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}
