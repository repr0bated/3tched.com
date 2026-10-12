// Distil the old design's pages into per-page content outlines the chatbot gets as reference:
// sections, tabs, fields, table columns and visible text only — never the layout.
// Usage: node scripts/export-legacy-outlines.mjs [SOURCE_DIR ...]
// Each SOURCE_DIR is a pages folder or a legacy repo root, in priority order. The first intact
// copy of a page wins; damaged files (NUL bytes) are skipped; the captured inventory is last.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = 'references/operation-dashboard-ui-07';
const sourceDirs = process.argv.length > 2 ? process.argv.slice(2) : ['operation-dashboard-ui-07'];
const inventory = JSON.parse(fs.readFileSync(`${root}/element-inventory.json`, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(`${root}/manifest.json`, 'utf8'));

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').replace(/\(\s*\)/g, '').trim();
const meaningful = (text) => /[A-Za-z]{2}/.test(text);
const unique = (values, limit) => [...new Set(values.map(clean).filter(meaningful))].slice(0, limit);

function literal(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) return clean(node.text);
  if (ts.isJsxExpression(node)) return literal(node.expression);
  return null;
}

/** Same element rules as scripts/extract-legacy-ui-reference.mjs, minus tags and classes. */
function extract(filename, text) {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const page = { headings: [], tabs: [], fields: [], columns: [], texts: [] };
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      const props = Object.fromEntries(node.attributes.properties.flatMap((p) => {
        if (!ts.isJsxAttribute(p)) return [];
        const value = literal(p.initializer);
        return value ? [[p.name.getText(source), value]] : [];
      }));
      const parent = ts.isJsxOpeningElement(node) ? node.parent : null;
      const inner = parent && ts.isJsxElement(parent) ? clean(parent.children.map(literal).filter(Boolean).join(' ')) : '';
      if (/^(h[1-6]|CardTitle|PageHeader)$/.test(tag) || (props.title && /Card|Panel|Header/.test(tag))) page.headings.push(props.title || inner);
      if (/^(input|textarea|select|Input|Textarea|Select|Switch|Checkbox|Label|label)$/.test(tag)) page.fields.push(inner || props.placeholder || props['aria-label'] || '');
      if (/TabsTrigger|TabButton/.test(tag)) page.tabs.push(inner);
      if (/^(th|TableHead)$/.test(tag)) page.columns.push(inner);
      if (inner) page.texts.push(inner);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return page;
}

function fromInventory(id, sourcePath) {
  const file = inventory.find((entry) => entry.id === id)?.files.find((entry) => entry.path === sourcePath);
  if (!file) return null;
  return {
    headings: file.headings.map((h) => h.text),
    tabs: file.tabs.map((t) => t.text),
    fields: file.fields.map((f) => f.text || f.props?.placeholder || ''),
    columns: file.columns.map((c) => c.text),
    texts: file.elements.map((e) => e.text ?? ''),
  };
}

/** The first intact copy of a source file across the source dirs, in priority order. */
function readSource(sourcePath) {
  for (const dir of sourceDirs) {
    for (const file of [path.join(dir, sourcePath), path.join(dir, path.basename(sourcePath))]) {
      if (!fs.existsSync(file)) continue;
      const text = fs.readFileSync(file, 'utf8');
      if (text.includes('\0')) {
        damaged.add(file);
        continue;
      }
      return { file, dir, text };
    }
  }
  return null;
}

const outlines = {};
const damaged = new Set();
for (const item of manifest.menu_items) {
  if (item.placeholder || !item.sourcePaths?.length) continue;
  const parts = [];
  const sources = new Set();
  for (const sourcePath of item.sourcePaths) {
    const found = readSource(sourcePath);
    if (found) {
      parts.push(extract(found.file, found.text));
      sources.add(found.dir);
    } else {
      const captured = fromInventory(item.id, sourcePath);
      if (captured) parts.push(captured);
      sources.add('captured');
    }
  }
  const source = [...sources].join('+');
  const all = (key) => parts.flatMap((part) => part[key]);
  outlines[item.id] = {
    label: item.label,
    section: item.section ?? null,
    source,
    headings: unique(all('headings'), 12),
    tabs: unique(all('tabs'), 10),
    fields: unique(all('fields'), 12),
    columns: unique(all('columns'), 16),
    texts: unique(all('texts'), 24),
  };
}

fs.writeFileSync(`${root}/outlines.json`, JSON.stringify(outlines, null, 2) + '\n');
const counts = {};
for (const page of Object.values(outlines)) counts[page.source] = (counts[page.source] ?? 0) + 1;
console.log(`Wrote ${Object.keys(outlines).length} outlines:`, counts);
if (damaged.size) console.log(`Skipped damaged files (NUL bytes): ${[...damaged].join(', ')}`);
