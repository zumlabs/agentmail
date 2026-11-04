import { useMemo } from "react";

const REMOTE_IMAGE = /<img[^>]+src=["'](?:https?:)?\/\//i;
const DANGEROUS_PROTOCOL = /^\s*(?:javascript|vbscript|data:text\/html)/i;

export function hasRemoteImages(html: string | null): boolean {
  return html ? REMOTE_IMAGE.test(html) : false;
}

/**
 * Email HTML is attacker-controlled. Strip anything executable, neutralise
 * layout escape hatches, and optionally replace remote images (tracking pixels)
 * with a placeholder. Output is injected into a class-scoped container, so no
 * iframe is needed and the reading column keeps native scrolling.
 */
function sanitizeHtml(html: string, allowImages: boolean): string {
  const doc = new DOMParser().parseFromString(html, "text/html");

  doc
    .querySelectorAll("script, style, link, meta, base, iframe, object, embed, form, input, button, textarea, select, noscript")
    .forEach((node) => node.remove());

  for (const element of Array.from(doc.querySelectorAll("*"))) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();

      if (name.startsWith("on") || name === "srcdoc" || name === "formaction") {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (name === "style") {
        let cleaned = attribute.value.replace(/(position\s*:\s*)(fixed|absolute|sticky)/gi, "$1static");
        if (!allowImages) cleaned = cleaned.replace(/background(?:-image)?\s*:\s*[^;]+/gi, "background:none");
        element.setAttribute(attribute.name, cleaned);
        continue;
      }
      if ((name === "href" || name === "src" || name === "srcset") && DANGEROUS_PROTOCOL.test(attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    }

    if (element.tagName === "A") {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer nofollow");
    }

    if (element.tagName === "IMG" && !allowImages) {
      const source = element.getAttribute("src") ?? "";
      if (/^(?:https?:)?\/\//i.test(source)) {
        const placeholder = doc.createElement("span");
        placeholder.className = "inline-flex items-center rounded-lg border border-dashed border-hairline px-2 py-1 text-[12px] text-secondary";
        const alt = element.getAttribute("alt");
        placeholder.textContent = alt ? `Image blocked · ${alt}` : "Remote image blocked";
        element.replaceWith(placeholder);
      }
    }
  }

  return doc.body.innerHTML;
}

export function MessageBody({ html, allowImages }: { html: string; allowImages: boolean }) {
  const sanitized = useMemo(() => sanitizeHtml(html, allowImages), [html, allowImages]);
  return (
    <div
      className="email-content"
      // eslint-disable-next-line react/no-danger -- sanitized above
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
