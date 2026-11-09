/**
 * CMS Generator — Qdrant compliance → Cozo relations + CMS spec
 * 
 * Server endpoint that:
 * 1. Queries Qdrant compliance_corpus_v2 for relevant compliance chunks
 * 2. Sends them to Muse Spark to generate Cozo relations + CMS spec simultaneously
 * 3. Returns both artifacts for review
 * 
 * The chatbot stays unaware of UI elements — it just produces Cozo relations
 * from compliance data. The existing json_render generator takes that and
 * renders the CMS frontend.
 */

import { json, fail } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Qdrant configuration
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = 'compliance_corpus_v2';
const QDRANT_VECTOR_DIM = 1024; // voyage-4 lite

// Muse Spark configuration
const MUSE_SPARK_MODEL = process.env.MUSE_SPARK_MODEL || 'muse-spark-1.3';
const MUSE_SPARK_BASE_URL = process.env.MUSE_SPARK_BASE_URL || 'https://api.meta.ai/v1';
const MUSE_SPARK_API_KEY = process.env.MUSE_SPARK_API_KEY || '';

const COZO_SYSTEM_PROMPT = `You are a compliance data processor. Extract structured compliance data from the provided text chunks and emit Cozo relation definitions.

Return only this JSON object:
{
  "cozo_relations": [
    {
      "relation_name": "controls",
      "schema": [{"name": "control_id", "type": "String"}, {"name": "title", "type": "String"}, {"name": "framework", "type": "String"}],
      "records": [["AC-1", "Access Control Policy", "NIST"]]
    }
  ]
}

Rules:
- Emit at least one relation from the chunks.
- relation_name and schema names are lowercase letters, digits, and underscores, and start with a letter.
- records contain the actual control ids, titles, frameworks, and descriptions from the chunks.
- Do not describe pages, components, tables, or layouts.`;

type Relation = {
  relation_name: string;
  schema: { name: string; type: string }[];
  records: unknown[][];
};

function cmsSpec(relations: Relation[]) {
  const rows = relations.flatMap((relation) =>
    relation.records.map((record, index) => ({
      id: `${relation.relation_name}-${index}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || `row-${index}`,
      cells: [relation.relation_name, record.map((cell) => String(cell)).join(" | ")],
    })),
  );
  return {
    root: "root",
    elements: {
      root: { type: "container", props: {}, children: ["header", "table"] },
      header: {
        type: "pageHeader",
        props: { title: "Compliance", subtitle: "Built from staged Cozo relations" },
      },
      table: {
        type: "dashboardTable",
        props: {
          caption: "Compliance controls",
          columns: [
            { id: "relation", label: "Relation" },
            { id: "record", label: "Record" },
          ],
          rows: rows.length ? rows : [{ id: "empty", cells: ["none", ""] }],
        },
      },
    },
  };
}

export const POST: RequestHandler = async ({ request }) => {
    try {
        // Step 1: Query Qdrant for compliance data
        const searchQuery = 'compliance control implementation';
        const topK = 10;
        
        const qdrantResponse = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: searchQuery,
                limit: topK,
                with_payload: true
            })
        });

        if (!qdrantResponse.ok) {
            throw new Error(`Qdrant query failed: ${qdrantResponse.status}`);
        }

        const qdrantData = await qdrantResponse.json();
        const points = qdrantData.result?.points || [];

        if (points.length === 0) {
            return fail(400, { error: 'No compliance data found in Qdrant' });
        }

        // Extract text chunks from Qdrant results
        const chunks = points.map(point => {
            const payload = point.payload || {};
            return {
                title: payload.title || '',
                control_id: payload.control_id || '',
                framework: payload.framework || payload.source || '',
                description: payload.text?.substring(0, 500) || '',
                kind: payload.kind || ''
            };
        }).filter(c => c.description);

        // Step 2: Build prompt for Muse Spark
        const userPrompt = `Extract compliance data from these ${chunks.length} chunks and emit Cozo relations only:

${chunks.map(c => `
- Control: ${c.control_id}
- Framework: ${c.framework}
- Title: ${c.title}
- Description: ${c.description}
`).join('\n')}

Generate the output in the exact JSON format specified in the system prompt.`;

        // Step 3: Call Muse Spark
        const chatCompletion = await fetch(`${MUSE_SPARK_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${MUSE_SPARK_API_KEY}`
            },
            body: JSON.stringify({
                model: MUSE_SPARK_MODEL,
                messages: [
                    { role: 'system', content: COZO_SYSTEM_PROMPT },
                    { role: 'user', content: userPrompt }
                ],
                max_tokens: 4000,
                temperature: 0.3
            })
        });

        if (!chatCompletion.ok) {
            throw new Error(`Muse Spark call failed: ${chatCompletion.status}`);
        }

        const chatData = await chatCompletion.json();
        const rawContent = chatData.choices?.[0]?.message?.content || '';

        // Step 4: Parse the response to extract Cozo relations + CMS spec
        let parsedOutput;
        try {
            // Extract JSON from markdown code blocks if present
            const jsonMatch = rawContent.match(/```json\s*([\s\S]*?)\s*```/) ||
                             rawContent.match(/```\s*([\s\S]*?)\s*```/) ||
                             [rawContent, rawContent];
            const jsonStr = jsonMatch[1]?.trim() || rawContent;
            parsedOutput = JSON.parse(jsonStr);
        } catch (parseError) {
            // Fallback: try to parse raw content
            try {
                parsedOutput = JSON.parse(rawContent);
            } catch {
                return fail(400, { 
                    error: 'Failed to parse model output',
                    rawContent: rawContent.substring(0, 1000)
                });
            }
        }

        if (!Array.isArray(parsedOutput.cozo_relations) || parsedOutput.cozo_relations.length === 0) {
            return fail(400, {
                error: 'Model did not return Cozo relations',
                cozo_relations: parsedOutput.cozo_relations
            });
        }

        return json({
            success: true,
            cozo_relations: parsedOutput.cozo_relations,
            cms_spec: cmsSpec(parsedOutput.cozo_relations),
            chunks_used: chunks.length,
            qdrant_points: points.length
        });

    } catch (error) {
        console.error('CMS Generator error:', error);
        return fail(500, { 
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
