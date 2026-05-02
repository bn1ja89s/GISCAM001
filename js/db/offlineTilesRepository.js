import { clearStore, deleteRecord, getAllRecords, getRecordByKey, putRecord } from "./indexeddb.js";

const TILE_STORE = "offline_tiles";
const METADATA_STORE = "offline_map_metadata";
const DEFAULT_METADATA_ID = "current";

export function buildTileId(provider, z, x, y) {
  return `${provider}:${z}:${x}:${y}`;
}

export function saveTile(tile) {
  return putRecord(TILE_STORE, {
    ...tile,
    id: tile.id || buildTileId(tile.provider, tile.z, tile.x, tile.y),
  });
}

export function getTile(provider, z, x, y) {
  return getRecordByKey(TILE_STORE, buildTileId(provider, z, x, y));
}

export async function tileExists(provider, z, x, y) {
  return Boolean(await getTile(provider, z, x, y));
}

export async function clearTiles(provider = "") {
  if (!provider) {
    await clearStore(TILE_STORE);
    return;
  }

  const tiles = await getAllRecords(TILE_STORE);
  await Promise.all(
    tiles
      .filter((tile) => tile.provider === provider)
      .map((tile) => deleteRecord(TILE_STORE, tile.id)),
  );
}

export async function countTiles(provider = "") {
  const tiles = await getAllRecords(TILE_STORE);
  return provider ? tiles.filter((tile) => tile.provider === provider).length : tiles.length;
}

export async function listTiles(provider = "") {
  const tiles = await getAllRecords(TILE_STORE);
  return provider ? tiles.filter((tile) => tile.provider === provider) : tiles;
}

export async function deleteTile(id) {
  return deleteRecord(TILE_STORE, id);
}

export function getMetadata(id = DEFAULT_METADATA_ID) {
  return getRecordByKey(METADATA_STORE, id);
}

export function saveMetadata(metadata) {
  return putRecord(METADATA_STORE, {
    ...metadata,
    id: metadata.id || DEFAULT_METADATA_ID,
  });
}

export async function clearMetadata(id = DEFAULT_METADATA_ID) {
  if (!id) {
    await clearStore(METADATA_STORE);
    return;
  }

  await deleteRecord(METADATA_STORE, id);
}
