import type { Props } from "astro";
import IconMail from "@/assets/icons/IconMail.svg";
import IconGitHub from "@/assets/icons/IconGitHub.svg";
import IconBrandX from "@/assets/icons/IconBrandX.svg";
import IconLinkedin from "@/assets/icons/IconLinkedin.svg";
import IconWhatsapp from "@/assets/icons/IconWhatsapp.svg";
import IconFacebook from "@/assets/icons/IconFacebook.svg";
import IconTelegram from "@/assets/icons/IconTelegram.svg";
import IconPinterest from "@/assets/icons/IconPinterest.svg";
import IconCalendar from "@/assets/icons/IconCalendar.svg";
import { SITE, CONNECT, SOCIALS_CONFIG } from "@/config";

interface Social {
  name: string;
  href: string;
  linkTitle: string;
  icon: (_props: Props) => Element;
}

const ICON_MAP: Record<string, (_props: Props) => Element> = {
  GitHub: IconGitHub,
  X: IconBrandX,
  LinkedIn: IconLinkedin,
  Mail: IconMail,
  WhatsApp: IconWhatsapp,
  Facebook: IconFacebook,
  Telegram: IconTelegram,
  Pinterest: IconPinterest,
  Calendly: IconCalendar,
};

export const SOCIALS: Social[] = [
  ...SOCIALS_CONFIG.map(s => ({
    name: s.name,
    href: s.url,
    linkTitle: `${SITE.author} on ${s.name}`,
    icon: ICON_MAP[s.name] ?? IconMail,
  })),
  ...(CONNECT.enabled
    ? [
        {
          name: "Calendly",
          href: "/connect",
          linkTitle: `Book a 1:1 with ${SITE.author}`,
          icon: IconCalendar,
        },
      ]
    : []),
];

export const SHARE_LINKS: Social[] = [
  {
    name: "WhatsApp",
    href: "https://wa.me/?text=",
    linkTitle: `Share this post via WhatsApp`,
    icon: IconWhatsapp,
  },
  {
    name: "Facebook",
    href: "https://www.facebook.com/sharer.php?u=",
    linkTitle: `Share this post on Facebook`,
    icon: IconFacebook,
  },
  {
    name: "X",
    href: "https://x.com/intent/post?url=",
    linkTitle: `Share this post on X`,
    icon: IconBrandX,
  },
  {
    name: "Telegram",
    href: "https://t.me/share/url?url=",
    linkTitle: `Share this post via Telegram`,
    icon: IconTelegram,
  },
  {
    name: "Pinterest",
    href: "https://pinterest.com/pin/create/button/?url=",
    linkTitle: `Share this post on Pinterest`,
    icon: IconPinterest,
  },
  {
    name: "Mail",
    href: "mailto:?subject=See%20this%20post&body=",
    linkTitle: `Share this post via email`,
    icon: IconMail,
  },
] as const;
