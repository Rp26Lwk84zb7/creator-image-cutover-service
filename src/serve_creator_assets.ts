import { createServer } from 'node:http';
import { createInfraiFromEnv, InfraiError } from './infrai_client.js';
import { publishCreatorAsset } from './creator_asset_workflow.js';

const infrai = createInfraiFromEnv();
const deliveryBucket = process.env.INFRAI_BUCKET;

if (!deliveryBucket) {
  throw new Error('INFRAI_BUCKET is required');
}

const server = createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/creator-assets/publish') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Not found' }));
    return;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  try {
    const bodyText = Buffer.concat(chunks).toString('utf8');
    const payload = JSON.parse(bodyText);
    const result = await publishCreatorAsset(payload, { infrai, deliveryBucket });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result, null, 2));
  } catch (error) {
    if (error instanceof InfraiError) {
      res.writeHead(error.status >= 400 && error.status < 500 ? error.status : 502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: error.message, code: error.code, details: error.details }));
      return;
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message }));
  }
});

server.listen(3000, () => {
  console.log('Listening on http://localhost:3000');
});
