import type {
  ContextDocument,
  KeyFile,
  StructuredDocument,
  StructuredPitfall,
  StructuredSection,
} from "./types.js";

function parseSections(content: string): StructuredSection[] {
  const sections: StructuredSection[] = [];
  let current: { title: string; level: number; lines: string[] } | null = null;

  for (const line of content.split("\n")) {
    const heading = /^(#+)\s+(.+)$/.exec(line);

    if (heading) {
      if (current) {
        sections.push({
          title: current.title,
          level: current.level,
          body: current.lines.join("\n").trim(),
        });
      }

      current = {
        title: (heading[2] ?? "").trim(),
        level: (heading[1] ?? "").length,
        lines: [],
      };

      continue;
    }

    if (current) {
      current.lines.push(line);
    }
  }

  if (current) {
    sections.push({
      title: current.title,
      level: current.level,
      body: current.lines.join("\n").trim(),
    });
  }

  return sections;
}

function parseKeyFileLine(line: string): KeyFile[] {
  const match = /^- `([^`]+)`(.*)$/u.exec(line.trim());

  if (!match) {
    return [];
  }

  const parsedPath = match[1];
  const description = (match[2] ?? "")
    .trim()
    .replace(/^[—-]\s*/u, "")
    .trim();

  if (!parsedPath) {
    return [];
  }

  return [{ path: parsedPath, description }];
}

function extractKeyFiles(sections: StructuredSection[]): KeyFile[] {
  return sections
    .filter(section => section.title === "Key Files")
    .flatMap(section => section.body.split("\n").flatMap(parseKeyFileLine));
}

function extractCodeBlocks(body: string): string[] {
  return Array.from(body.matchAll(/```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g))
    .map(match => match[1])
    .filter((diagram): diagram is string => typeof diagram === "string")
    .map(diagram => diagram.trim());
}

function extractStateMachines(sections: StructuredSection[]): StructuredDocument["stateMachines"] {
  return sections
    .filter(section => {
      const normalizedTitle = section.title.toLowerCase();
      return (
        normalizedTitle.includes("state machine") || normalizedTitle.endsWith("states")
      );
    })
    .flatMap(section =>
      extractCodeBlocks(section.body).map(diagram => ({
        section: section.title,
        diagram,
      })),
    );
}

function toStructuredPitfall(pitfall: ContextDocument): StructuredPitfall {
  return {
    path: pitfall.path,
    title: pitfall.title,
    confidence: pitfall.confidence,
    lastVerified: pitfall.lastVerified,
    content: pitfall.content,
  };
}

export function buildStructuredDocument(
  document: ContextDocument,
  pitfalls: ContextDocument[],
): StructuredDocument {
  const sections = parseSections(document.content);

  return {
    path: document.path,
    title: document.title,
    domain: document.domain,
    tags: document.tags,
    confidence: document.confidence,
    lastVerified: document.lastVerified,
    keyFiles: extractKeyFiles(sections),
    stateMachines: extractStateMachines(sections),
    pitfalls: pitfalls.map(toStructuredPitfall),
    sections,
  };
}
