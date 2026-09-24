import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const sourceRoot = process.argv[2];
if (!sourceRoot) throw new Error('Usage: node scripts/extract-legacy-ui-reference.mjs LEGACY_REPO');
const reference = 'references/operation-dashboard-ui-07';
const manifest = JSON.parse(fs.readFileSync(`${reference}/manifest.json`, 'utf8'));
const result = [];
const clean = s => s.replace(/\s+/g, ' ').trim();
for (const item of manifest.menu_items) {
  const files = [];
  for (const filename of item.sourcePaths) {
    const source = ts.createSourceFile(filename, fs.readFileSync(path.join(sourceRoot, filename), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const elements = [], headings = [], fields = [], tabs = [], columns = [];
    function literal(node) {
      if (!node) return null;
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) return clean(node.text);
      if (ts.isJsxExpression(node)) return literal(node.expression);
      return null;
    }
    function visit(node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(source);
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        const props = Object.fromEntries(node.attributes.properties.flatMap(p => {
          if (!ts.isJsxAttribute(p)) return [];
          const value = literal(p.initializer);
          return value ? [[p.name.getText(source), value]] : [];
        }));
        const parent = ts.isJsxOpeningElement(node) ? node.parent : null;
        const text = parent && ts.isJsxElement(parent) ? clean(parent.children.map(literal).filter(Boolean).join(' ')) : '';
        elements.push({tag, line, ...(text ? {text} : {}), ...(Object.keys(props).length ? {props} : {})});
        if (/^(h[1-6]|CardTitle|PageHeader)$/.test(tag) || (props.title && /Card|Panel|Header/.test(tag))) headings.push({text:props.title || text, line});
        if (/^(input|textarea|select|Input|Textarea|Select|Switch|Checkbox|Label|label)$/.test(tag)) fields.push({tag, text, props, line});
        if (/TabsTrigger|TabButton/.test(tag)) tabs.push({text, props, line});
        if (/^(th|TableHead)$/.test(tag)) columns.push({text, line});
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    files.push({path:filename, headings, fields, tabs, columns, elements});
  }
  result.push({id:item.id, label:item.label, placeholder:item.placeholder, files});
}
fs.writeFileSync(`${reference}/element-inventory.json`, JSON.stringify(result,null,2)+'\n');
for (const item of result) console.log(`${item.id}: ${item.files.flatMap(f=>f.headings.map(h=>h.text)).filter(Boolean).join(' | ')}`);
