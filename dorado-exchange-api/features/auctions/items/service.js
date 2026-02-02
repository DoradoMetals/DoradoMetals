import pool from "#db";
import * as itemsRepo from "#features/auctions/items/repo.js";

export async function list({ auction_id }) {
  return itemsRepo.listByAuction(auction_id);
}

export async function getAll() {
  return itemsRepo.getAll();
}

export async function create({ auction_id, item }) {
  return itemsRepo.create({
    auction_id,
    bullion_id: item.bullion_id,
    buyer_email: item.buyer_email,
    buyer_name: item.buyer_name,
    sold: item.sold,
    starting_bid: item.starting_bid,
    ending_bid: item.ending_bid,
    quantity: item.quantity,
    number: item.number,
  });
}

export async function createLots({ auction_id, lots }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await itemsRepo.lockByAuction(auction_id, client);

    const created = await itemsRepo.createLots({
      auction_id,
      bullion_id: lots.bullion_id,
      quantity_per_lot: lots.quantity_per_lot,
      lot_count: lots.lot_count,
      starting_bid: lots.starting_bid,
    }, client);

    await itemsRepo.ensureCurrentLot({ auction_id }, client);

    await client.query("COMMIT");
    return created;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function update({ item_id, patch }) {
  return itemsRepo.update({ item_id, patch });
}

export async function move({ auction_id, item_id, to_number }) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const items = await itemsRepo.moveAndReorderLot({ auction_id, item_id, to_number }, client)
    await client.query("COMMIT")
    return items
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  } finally {
    client.release()
  }
}


export async function removeMany({ auction_id, item_ids }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await itemsRepo.lockByAuction(auction_id, client);
    await itemsRepo.removeMany({ auction_id, item_ids }, client);
    await itemsRepo.reorderByAuction(auction_id, client);

    await itemsRepo.ensureCurrentLot({ auction_id }, client);

    const items = await itemsRepo.listByAuction(auction_id, client);

    await client.query("COMMIT");
    return items;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function setCurrentLot({ auction_id, item_id }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await itemsRepo.lockByAuction(auction_id, client);

    const res = await itemsRepo.setCurrentLot({ auction_id, item_id }, client);

    await client.query("COMMIT");
    return res;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function nextCurrentLot({ auction_id }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await itemsRepo.lockByAuction(auction_id, client);

    const res = await itemsRepo.nextCurrentLot({ auction_id }, client);

    await client.query("COMMIT");
    return res;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function prevCurrentLot({ auction_id }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await itemsRepo.lockByAuction(auction_id, client);

    const res = await itemsRepo.prevCurrentLot({ auction_id }, client);

    await client.query("COMMIT");
    return res;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function ensureCurrentLot({ auction_id }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await itemsRepo.lockByAuction(auction_id, client);

    const res = await itemsRepo.ensureCurrentLot({ auction_id }, client);

    await client.query("COMMIT");
    return res;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function getCurrentLot({ auction_id }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await itemsRepo.lockByAuction(auction_id, client);
    await itemsRepo.ensureCurrentLot({ auction_id }, client);

    const row = await itemsRepo.getCurrentLotByAuction(auction_id, client);

    await client.query("COMMIT");
    return row;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
