export interface Platform {
  id: string;
  name: string;
  /** Where a favorite for this platform opens. */
  url: string;
  /** Hosts that count as this platform when checking whether it is already a favorite. */
  domains: string[];
  owner: string;
  /** Approximate monthly users, as a display string. */
  users: string;
}

/**
 * The twenty largest social platforms by monthly users, in that order. Addresses are the ones a
 * phone browser lands on without bouncing through another domain (checked with a mobile Safari
 * user agent), because a session stays pinned to the domain it settles on. Bundled recipes cover
 * only some of these; the rest open as plain pages with ad and tracker blocking.
 */
export const PLATFORMS: Platform[] = [
  {
    id: "facebook",
    name: "Facebook",
    url: "https://www.facebook.com/",
    domains: ["facebook.com"],
    owner: "Meta",
    users: "3.07 billion",
  },
  {
    id: "instagram",
    name: "Instagram",
    url: "https://www.instagram.com/",
    domains: ["instagram.com"],
    owner: "Meta",
    users: "3.0 billion",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    url: "https://web.whatsapp.com/",
    domains: ["whatsapp.com"],
    owner: "Meta",
    users: "3.0 billion",
  },
  {
    id: "youtube",
    name: "YouTube",
    url: "https://m.youtube.com/",
    domains: ["youtube.com"],
    owner: "Google",
    users: "2.5–2.85 billion",
  },
  {
    id: "tiktok",
    name: "TikTok",
    url: "https://www.tiktok.com/",
    domains: ["tiktok.com"],
    owner: "ByteDance",
    users: "~2 billion",
  },
  {
    id: "wechat",
    name: "WeChat",
    url: "https://web.wechat.com/",
    domains: ["wechat.com", "weixin.qq.com", "wx.qq.com"],
    owner: "Tencent",
    users: "1.41 billion",
  },
  {
    id: "messenger",
    name: "Messenger",
    url: "https://www.messenger.com/",
    domains: ["messenger.com"],
    owner: "Meta",
    users: "1.01 billion",
  },
  {
    id: "telegram",
    name: "Telegram",
    url: "https://web.telegram.org/a/",
    domains: ["telegram.org", "t.me"],
    owner: "Telegram",
    users: "~1 billion",
  },
  {
    id: "snapchat",
    name: "Snapchat",
    url: "https://www.snapchat.com/",
    domains: ["snapchat.com"],
    owner: "Snap",
    users: "~900 million+",
  },
  {
    id: "reddit",
    name: "Reddit",
    url: "https://www.reddit.com/",
    domains: ["reddit.com"],
    owner: "Reddit",
    users: "850 million",
  },
  {
    id: "kuaishou",
    name: "Kuaishou",
    url: "https://www.kuaishou.com/",
    domains: ["kuaishou.com"],
    owner: "Kuaishou",
    users: "772 million",
  },
  {
    id: "douyin",
    name: "Douyin",
    url: "https://www.douyin.com/",
    domains: ["douyin.com"],
    owner: "ByteDance",
    users: "755 million",
  },
  {
    id: "qq",
    name: "QQ",
    url: "https://im.qq.com/",
    domains: ["im.qq.com", "web.qq.com", "qzone.qq.com"],
    owner: "Tencent",
    users: "~500–650 million",
  },
  {
    id: "x",
    name: "X (Twitter)",
    url: "https://x.com/",
    domains: ["x.com", "twitter.com"],
    owner: "X",
    users: "~650 million",
  },
  {
    id: "pinterest",
    name: "Pinterest",
    url: "https://www.pinterest.com/",
    domains: ["pinterest.com"],
    owner: "Pinterest",
    users: "~570–640 million",
  },
  {
    id: "weibo",
    name: "Weibo",
    url: "https://m.weibo.cn/",
    domains: ["weibo.cn", "weibo.com"],
    owner: "Sina",
    users: "~560–590 million",
  },
  {
    id: "threads",
    name: "Threads",
    url: "https://www.threads.com/",
    domains: ["threads.com", "threads.net"],
    owner: "Meta",
    users: "400–500 million",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    url: "https://www.linkedin.com/",
    domains: ["linkedin.com"],
    owner: "Microsoft",
    users: "310 million",
  },
  {
    id: "discord",
    name: "Discord",
    url: "https://discord.com/app",
    domains: ["discord.com"],
    owner: "Discord",
    users: "200 million+",
  },
  {
    id: "twitch",
    name: "Twitch",
    url: "https://m.twitch.tv/",
    domains: ["twitch.tv"],
    owner: "Amazon",
    users: "~200 million",
  },
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
