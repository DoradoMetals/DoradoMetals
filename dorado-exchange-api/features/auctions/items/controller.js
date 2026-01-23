import * as itemsService from "#features/auctions/items/service.js";

export async function getByAuction(req, res, next) {

  try {
    const rows = await itemsService.list(req.query);
    return res.status(200).json(rows);
  } catch (err) {
    return next(err);
  }
}

export async function getAll(req, res, next) {
  try {
    const rows = await itemsService.getAll();
    return res.status(200).json(rows);
  } catch (err) {
    return next(err);
  }
}

export async function create(req, res, next) {
  try {
    const saved = await itemsService.create(req.body);
    return res.status(200).json(saved);
  } catch (err) {
    return next(err);
  }
}

export async function createLots(req, res, next) {
  try {
    const saved = await itemsService.createLots(req.body);
    return res.status(200).json(saved);
  } catch (err) {
    return next(err);
  }
}

export async function update(req, res, next) {
  try {
    const saved = await itemsService.update(req.body);
    return res.status(200).json(saved);
  } catch (err) {
    return next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const msg = await itemsService.remove(req.body);
    return res.status(200).json(msg);
  } catch (err) {
    return next(err);
  }
}

export async function removeMany(req, res, next) {
  try {
    const items = await itemsService.removeMany(req.body);
    return res.status(200).json(items);
  } catch (err) {
    return next(err);
  }
}

export async function move(req, res, next) {
  try {
    const saved = await itemsService.move(req.body);
    return res.status(200).json(saved);
  } catch (err) {
    return next(err);
  }
}

export async function reorder(req, res, next) {
  try {
    const saved = await itemsService.reorder(req.body);
    return res.status(200).json(saved);
  } catch (err) {
    return next(err);
  }
}
