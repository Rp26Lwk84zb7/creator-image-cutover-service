import { createInfraiFromEnv } from './infrai_client.js';
import { publishCreatorAsset } from './creator_asset_workflow.js';

async function main() {
  const infrai = createInfraiFromEnv();
  const deliveryBucket = process.env.INFRAI_BUCKET;

  if (!deliveryBucket) {
    throw new Error('INFRAI_BUCKET is required');
  }

  const request = {
    creatorId: 'creator_77',
    dropId: 'drop_2048',
    filename: 'hero.webp',
    mimeType: 'image/webp',
    imageBase64: 'UklGRiIAAABXRUJQVlA4IBYAAAAQAgCdASoIAAIAAUAmJQBOgCHwAP7+',
    incumbentAssetKey: 'legacy/creator_77/drop_2048/hero.webp',
    publishMode: 'shadow' as const
  };

  const result = await publishCreatorAsset(request, { infrai, deliveryBucket });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
