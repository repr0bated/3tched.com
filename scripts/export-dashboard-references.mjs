import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { referenceBundle } = await import(pathToFileURL(path.resolve('.reference-build/references.js')).href);
const root = 'references/operation-dashboard-ui-07';
fs.mkdirSync(`${root}/specs`, { recursive: true });
for (const entry of referenceBundle.examples) {
  fs.writeFileSync(`${root}/specs/${entry.id}.json`, JSON.stringify(entry.spec, null, 2) + '\n');
}
fs.writeFileSync(`${root}/catalog.schema.json`, JSON.stringify(referenceBundle.catalogSchema, null, 2) + '\n');
fs.writeFileSync('references/canvas-profile.json', JSON.stringify(referenceBundle.canvasProfile, null, 2) + '\n');
fs.writeFileSync(`${root}/catalog.prompt.txt`, referenceBundle.catalogPrompt + '\n');
const manifest = JSON.parse(fs.readFileSync(`${root}/manifest.json`, 'utf8'));
manifest.catalog = { schema: 'catalog.schema.json', prompt: 'catalog.prompt.txt', inventory: 'element-inventory.json' };
for (const item of manifest.menu_items) {
  item.exampleSpec = `specs/${item.id}.json`;
  const entry = referenceBundle.examples.find(example => example.id === item.id);
  item.elements = [...new Set(Object.values(entry.spec.elements).map(element => element.type))];
}
fs.writeFileSync(`${root}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Exported ${referenceBundle.examples.length} source-linked compositions and their catalog.`);
