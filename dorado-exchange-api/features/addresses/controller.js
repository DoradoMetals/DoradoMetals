import * as addressService from "#features/addresses/service.js"

export async function getAll(req, res, next) {
  try {
    const { user_id } = req.query;
    const rows = await addressService.list(user_id);
    return res.status(200).json(rows);
  } catch (err) {
    return next(err);
  }
}

export async function create(req, res, next) {
  try {
    const { address, user_id } = req.body;
    const saved = await addressService.create({ address, userId: user_id });
    return res.status(200).json(saved);
  } catch (err) {
    return next(err);
  }
}

export async function update(req, res, next) {
  try {
    const { address, user_id } = req.body;
    const saved = await addressService.update({ address, userId: user_id });
    return res.status(200).json(saved);
  } catch (err) {
    return next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const { user_id, address } = req.body;
    const msg = await addressService.remove({ userId: user_id, addressId: address.id });
    return res.status(200).json(msg);
  } catch (err) {
    return next(err);
  }
}

export async function setDefault(req, res, next) {
  try {
    const { user_id, address } = req.body;
    const msg = await addressService.setDefault({ userId: user_id, addressId: address.id });
    return res.status(200).json(msg);
  } catch (err) {
    return next(err);
  }
}
