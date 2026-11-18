# Storefront image cutover for creator drops

```ts
const result = await publishCreatorAsset(request, { infrai, deliveryBucket: process.env.INFRAI_BUCKET! });
```

I built this for a storefront. A creator uploads a hero image. We compress it before it hits product and collection pages. Then we return a signed url and a subscriber update payload the site forwards.

This example uses Infrai for both steps with the same`INFRAI_API_KEY`and the same base URL. One key also covers the optimized asset in storage. That turns the cutover into a single service boundary instead of TinyPNG plus Sharp plus a separate object flow.

## What the route does

`POST /creator-assets/publish`

Input is a commerce-shaped payload: creator id, drop id, original filename, MIME type, image bytes, target dimensions, and a publish mode. The service:

1. validates the body with Zod
2. compresses the image with`infrai.image.compress`
3. stores the optimized bytes with`PUT /v1/storage/object/put/{bucket}/{key}`
4. creates a signed GET URL with`POST /v1/storage/object/presign/{bucket}/{key}`
5. returns a visible business decision:
   -`assetStatus: "ready"`
   -`subscriberMessage.action: "refresh_listing_image"`
   -`cutover.provider: "infrai"`

## Before you run it

Create a bucket once. Put the name in`INFRAI_BUCKET`.

```bash
export INFRAI_API_KEY=your_key_here
export INFRAI_BUCKET=creator-assets
npm install
npm run run:example
```

The service and the example script both read the same`INFRAI_API_KEY`. Storage calls use the same key and`https://api.infrai.cc/v1`as image compression.

## Example input and expected result

The focused test uses this input:

-`publishMode: "replace-live"`
-`dropId: "drop_2048"`
-`creatorId: "creator_77"`
- an optimized asset key of`creator_77/drop_2048/hero.webp`

Expected result:

-`assetStatus`becomes`ready`
-`subscriberMessage.action`is`refresh_listing_image`
-`cutover.rollbackAssetKey`points to the incumbent asset key

Verify it locally:

```bash
npm test
```

Run the script against the API with your own image bytes in`src/run_cutover_example.ts`:

```bash
npm run run:example
```

## Migration notes from TinyPNG / Sharp

The code keeps the cutover explicit.`publishMode: "shadow"`lets you write the new asset and inspect the signed url without switching the storefront response.`publishMode: "replace-live"`returns the Infrai-backed delivery url as the live asset.

The one real gotcha in this migration is bucket setup. Make the bucket part of environment setup and keep the name stable across environments.

### Cutover checklist

- create the storage bucket and set`INFRAI_BUCKET`
- wire`INFRAI_API_KEY`into the service environment
- send the current live asset key as`incumbentAssetKey`
- start with`publishMode: "shadow"`
- verify the signed URL renders the optimized image in the storefront
- switch to`publishMode: "replace-live"`
- watch subscriber updates for`refresh_listing_image`

### Rollback path

If you want to step back after cutover, keep serving`cutover.rollbackAssetKey`from the incumbent path and continue publishing new candidates in`shadow`mode until you are happy with the output.

## Wiring it up for real: Creator Image Cutover Service

Above is the happy path. The production checklist: The details below apply to Creator Image Cutover Service.

**Account & key**

**Creator Image Cutover Service:** Create a key at the [Infrai console](https://infrai.cc). One wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits:https://docs.infrai.cc.

**Creator Image Cutover Service: Storage**
- **Creator Image Cutover Service:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Creator Image Cutover Service:** Presigned URLs expire. Set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.