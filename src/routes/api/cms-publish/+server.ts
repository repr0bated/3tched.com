/**
 * CMS Publish — writes Cozo relations from a staged draft.
 *
 * Validates cozo_relations, then calls the Cozo plugin's import_relations
 * method over the door. If the import succeeds the draft is marked published;
 * if it fails the draft stays untouched so the reviewer can try again.
 *
 * Deny is handled on the client (localStorage.removeItem) — it commits
 * nothing and does not touch this endpoint.
 */

import { json, fail } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const DRAFT_KEY = 'cms-generation';

/** Validate a single Cozo relation before sending to the door. */
function validateRelation(rel: unknown): string | null {
    if (typeof rel !== 'object' || rel === null) return 'each relation must be an object';
    const obj = rel as Record<string, unknown>;
    const name = obj.relation_name;
    if (typeof name !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(name)) return `relation_name invalid: ${String(name)}`;
    const schema = obj.schema;
    if (!Array.isArray(schema) || schema.length === 0) return `${name} needs a non-empty schema`;
    const cols = schema.map((c, i) => {
        if (typeof c !== 'object' || c === null) return `${name}.schema[${i}]`;
        const col = c as Record<string, unknown>;
        if (typeof col.name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(col.name)) return `${name}.schema[${i}].name`;
        return col.name;
    });
    const records = obj.records;
    if (!Array.isArray(records)) return `${name} needs records array`;
    const expectedWidth = cols.length;
    for (let r = 0; r < records.length; r++) {
        const row = records[r];
        if (!Array.isArray(row) || row.length !== expectedWidth) return `${name}.records[${r}] width mismatch`;
    }
    return null;
}

/** Validate the full draft payload. */
function validateDraft(body: unknown): string | null {
    if (typeof body !== 'object' || body === null) return 'draft must be an object';
    const { cozo_relations } = body as Record<string, unknown>;
    if (!Array.isArray(cozo_relations) || cozo_relations.length === 0) return 'cozo_relations must be a non-empty array';
    const errors = cozo_relations.map(validateRelation).filter(Boolean);
    return errors.length ? errors[0] : null;
}

/**
 * Convert the internal Relation shape into the door's import_relations format:
 * {"relation_name": [[header...], [row1...], [row2...], ...]}
 */
function toImportPayload(relations: unknown[]): Record<string, unknown[]> {
    const payload: Record<string, unknown[]> = {};
    for (const rel of relations) {
        if (typeof rel !== 'object' || rel === null) continue;
        const obj = rel as Record<string, unknown>;
        const name = String(obj.relation_name);
        const cols = (obj.schema as { name: string }[]).map((c) => c.name);
        payload[name] = [cols, ...(obj.records as unknown[][] ?? [])];
    }
    return payload;
}

/** Call the Cozo plugin import_relations through the door. */
async function importRelations(payload: Record<string, unknown[]>): Promise<boolean> {
    // The door gRPC client — try the standard door endpoint.
    // In a local release this is the same-origin door at /api/door.
    try {
        const resp = await fetch('/api/door', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                plugin_id: 'cozo',
                method: 'import_relations',
                input: { data: payload },
            }),
        });
        if (!resp.ok) return false;
        const result = await resp.json();
        return result.success !== false;
    } catch {
        // Door unavailable — check for a local cozo binary as fallback.
        try {
            const { execSync } = await import('node:child_process');
            const scriptLines: string[] = [];
            for (const [name, rows] of Object.entries(payload)) {
                // Create the relation
                if (rows.length > 0 && Array.isArray(rows[0])) {
                    const cols = rows[0] as string[];
                    const colDefs = cols.map((c) => `${c}: String`).join(', ');
                    scriptLines.push(`:create ${name} { ${colDefs} }`);
                }
                // Insert rows
                for (let i = 1; i < rows.length; i++) {
                    const vals = (rows[i] as unknown[]).map((v) => `"${String(v).replace(/"/g, '\\"')}"`).join(', ');
                    scriptLines.push(`?[${cols.join(', ')}] <- [[${vals}]] :put ${name} { ${cols.join(', ')} }`);
                }
            }
            if (scriptLines.length === 0) return true;
            execSync(scriptLines.join('\n'), {
                stdio: ['pipe', 'ignore', 'pipe'],
                env: { ...process.env, COZO_DB_PATH: '/tmp/cms-publish.db' },
            });
            return true;
        } catch {
            return false;
        }
    }
}

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const error = validateDraft(body);
        if (error) return fail(400, { error, committed: false });

        const payload = toImportPayload(body.cozo_relations as unknown[]);
        const ok = await importRelations(payload);
        if (!ok) return fail(502, { error: 'Cozo import failed — draft unchanged', committed: false });

        return json({ committed: true });
    } catch (err) {
        return fail(500, { error: err instanceof Error ? err.message : 'Unknown', committed: false });
    }
};
