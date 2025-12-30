import * as servicesRepo from "#features/shipping/services/repo.js";

export async function getAll(req, res, next) {
  try {
    const result = await servicesRepo.getAll();
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function getOne(req, res, next) {
  try {
    const { id } = req.query;
    const result = await servicesRepo.getById(id);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function getByCarrier(req, res, next) {
  try {
    const { carrier_id } = req.query;
    const result = await servicesRepo.getByCarrierId(carrier_id);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function create(req, res, next) {
  try {
    const { service } = req.body;
    const result = await servicesRepo.create(service);
    return res.status(201).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function update(req, res, next) {
  try {
    const { service } = req.body;
    const result = await servicesRepo.update(service);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await servicesRepo.remove(req.body);
    return res.status(200).json(true);
  } catch (err) {
    return next(err);
  }
}
