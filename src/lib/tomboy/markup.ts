type XmlTextNode = { type: "text"; value: string };
type XmlElementNode = { type: "element"; name: string; children: XmlNode[] };
type XmlNode = XmlTextNode | XmlElementNode;

type Frame = {
  name: string;
  children: XmlNode[];
};

export type TomboyMarkupResult = {
  markdown: string;
  unknownTags: string[];
};

/**
 * Convert the small XML vocabulary Tomboy permits inside `<note-content>` to Markdown.
 * This is deliberately a fragment parser rather than a chain of tag-stripping regexes:
 * formatting tags nest, and list items need their boundaries to survive conversion.
 */
export function tomboyToMarkdown(source: string): TomboyMarkupResult {
  const nodes = parseXmlFragment(source);
  const unknownTags = new Set<string>();
  const markdown = renderNodes(nodes, unknownTags, 0)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { markdown, unknownTags: [...unknownTags].sort() };
}

/** XML text extraction used for scalar fields such as `<title>` and `<tag>`. */
export function tomboyXmlText(source: string): string {
  return collectText(parseXmlFragment(source));
}

function parseXmlFragment(source: string): XmlNode[] {
  const root: Frame = { name: "#root", children: [] };
  const stack: Frame[] = [root];
  let cursor = 0;

  while (cursor < source.length) {
    const open = source.indexOf("<", cursor);
    if (open < 0) {
      pushText(stack, source.slice(cursor));
      break;
    }

    if (open > cursor) pushText(stack, source.slice(cursor, open));

    if (source.startsWith("<!--", open)) {
      const end = source.indexOf("-->", open + 4);
      if (end < 0) throw new Error("Unclosed XML comment in note content.");
      cursor = end + 3;
      continue;
    }

    if (source.startsWith("<![CDATA[", open)) {
      const end = source.indexOf("]]>", open + 9);
      if (end < 0) throw new Error("Unclosed CDATA section in note content.");
      stack[stack.length - 1].children.push({
        type: "text",
        value: source.slice(open + 9, end),
      });
      cursor = end + 3;
      continue;
    }

    if (source.startsWith("<?", open)) {
      const end = source.indexOf("?>", open + 2);
      if (end < 0) throw new Error("Unclosed XML declaration in note content.");
      cursor = end + 2;
      continue;
    }

    const end = findTagEnd(source, open + 1);
    if (end < 0) throw new Error("Unclosed XML tag in note content.");
    const token = source.slice(open + 1, end).trim();

    if (token.startsWith("!")) {
      cursor = end + 1;
      continue;
    }

    if (token.startsWith("/")) {
      const closeName = tagName(token.slice(1));
      if (stack.length === 1 || stack[stack.length - 1].name !== closeName) {
        throw new Error(`Unexpected closing </${closeName}> in note content.`);
      }
      const frame = stack.pop()!;
      stack[stack.length - 1].children.push({
        type: "element",
        name: frame.name,
        children: frame.children,
      });
      cursor = end + 1;
      continue;
    }

    const selfClosing = /\/\s*$/.test(token);
    const name = tagName(selfClosing ? token.replace(/\/\s*$/, "") : token);
    if (selfClosing) {
      stack[stack.length - 1].children.push({ type: "element", name, children: [] });
    } else {
      stack.push({ name, children: [] });
    }
    cursor = end + 1;
  }

  if (stack.length !== 1) {
    throw new Error(`Unclosed <${stack[stack.length - 1].name}> in note content.`);
  }
  return root.children;
}

function pushText(stack: Frame[], raw: string): void {
  if (raw === "") return;
  stack[stack.length - 1].children.push({ type: "text", value: decodeXml(raw) });
}

function findTagEnd(source: string, from: number): number {
  let quote: '"' | "'" | null = null;
  for (let i = from; i < source.length; i++) {
    const char = source[i];
    if (quote !== null) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return i;
    }
  }
  return -1;
}

function tagName(token: string): string {
  const match = /^([A-Za-z_][\w:.-]*)\b/.exec(token.trim());
  if (!match) throw new Error("Invalid XML tag in note content.");
  return match[1].toLowerCase();
}

function decodeXml(source: string): string {
  return source.replace(
    /&(#x[0-9a-f]+|#\d+|amp|apos|gt|lt|quot);/gi,
    (_, entity: string) => {
      const lower = entity.toLowerCase();
      if (lower === "amp") return "&";
      if (lower === "apos") return "'";
      if (lower === "gt") return ">";
      if (lower === "lt") return "<";
      if (lower === "quot") return '"';

      const value = lower.startsWith("#x")
        ? Number.parseInt(lower.slice(2), 16)
        : Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : _;
    },
  );
}

function collectText(nodes: XmlNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text") return node.value;
      if (node.name === "br" || node.name === "newline") return "\n";
      return collectText(node.children);
    })
    .join("");
}

function renderNodes(
  nodes: XmlNode[],
  unknownTags: Set<string>,
  listDepth: number,
): string {
  return nodes.map((node) => renderNode(node, unknownTags, listDepth)).join("");
}

function renderNode(
  node: XmlNode,
  unknownTags: Set<string>,
  listDepth: number,
): string {
  if (node.type === "text") return node.value;

  if (node.name === "list") return renderList(node, unknownTags, listDepth);
  if (node.name === "list-item") {
    return renderNodes(node.children, unknownTags, listDepth).trim();
  }

  const body = renderNodes(node.children, unknownTags, listDepth);
  switch (node.name) {
    case "bold":
      return wrapInline(body, "**");
    case "italic":
      return wrapInline(body, "*");
    case "strikethrough":
      return wrapInline(body, "~~");
    case "monospace":
      return renderCode(body);
    case "highlight":
      return wrapInline(body, "**");
    case "size:huge":
      return renderHeading(body, 2);
    case "size:large":
      return renderHeading(body, 3);
    case "size:small":
    case "link:url":
    case "link:internal":
    case "link:broken":
      return body;
    case "br":
    case "newline":
      return "\n";
    default:
      unknownTags.add(node.name);
      return body;
  }
}

function wrapInline(body: string, marker: string): string {
  if (body === "" || body.trim() === "") return body;
  // A block produced by a nested size tag already carries stronger Markdown structure.
  if (/(?:^|\n)#{1,6} /.test(body)) return body;
  return `${marker}${body}${marker}`;
}

function renderHeading(body: string, level: number): string {
  const text = body.trim();
  if (text === "") return body;
  return `\n${"#".repeat(level)} ${text}\n`;
}

function renderCode(body: string): string {
  if (body.includes("\n")) return `\n\`\`\`\n${body.trim()}\n\`\`\`\n`;
  const longestRun = Math.max(
    0,
    ...Array.from(body.matchAll(/`+/g), (m) => m[0].length),
  );
  const fence = "`".repeat(longestRun + 1);
  return `${fence}${body}${fence}`;
}

function renderList(
  node: XmlElementNode,
  unknownTags: Set<string>,
  depth: number,
): string {
  const items = node.children.filter(
    (child): child is XmlElementNode =>
      child.type === "element" && child.name === "list-item",
  );
  if (items.length === 0) return renderNodes(node.children, unknownTags, depth);

  const indent = "  ".repeat(depth);
  const continuation = "  ".repeat(depth + 1);
  const rendered = items.map((item) => {
    const body = renderNodes(item.children, unknownTags, depth + 1)
      .trim()
      .replace(/\n{2,}(?=\s*- )/g, "\n");
    const [first = "", ...rest] = body.split("\n");
    return `${indent}- ${first}${rest
      .map((line) => {
        if (line === "") return "\n";
        if (/^\s*- /.test(line)) return `\n${line}`;
        return `\n${continuation}${line}`;
      })
      .join("")}`;
  });
  return `\n${rendered.join("\n")}\n`;
}
