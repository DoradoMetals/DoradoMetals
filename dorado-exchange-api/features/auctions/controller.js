import * as auctionsService from "#features/auctions/service.js";

export async function getAll(req, res, next) {
  try {
    const rows = await auctionsService.list();
    return res.status(200).json(rows);
  } catch (err) {
    return next(err);
  }
}

export async function getOne(req, res, next) {
  try {
    const row = await auctionsService.get(req.query);
    return res.status(200).json(row);
  } catch (err) {
    return next(err);
  }
}

export async function create(req, res, next) {
  try {
    const saved = await auctionsService.create(req.body);
    return res.status(200).json(saved);
  } catch (err) {
    return next(err);
  }
}

export async function update(req, res, next) {
  try {
    const saved = await auctionsService.update(req.body);
    return res.status(200).json(saved);
  } catch (err) {
    return next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const msg = await auctionsService.remove(req.body);
    return res.status(200).json(msg);
  } catch (err) {
    return next(err);
  }
}

