import { EntityManager } from '@mikro-orm/postgresql';
import { BullionRepo } from './repo';

export class BullionService {
  private repo: BullionRepo;

  constructor(em: EntityManager) {
    this.repo = new BullionRepo(em);
  }

  getAll() {
    return this.repo.getAllPublic();
  }

  getSellable() {
    return this.repo.getSellable();
  }

  getHomepage() {
    return this.repo.getHomepage();
  }

  getFromSlug(input: { slug: string }) {
    return this.repo.getBySlug(input.slug);
  }

  getFiltered(query: {
    metal_type?: string;
    filter_category?: string;
    type?: string;
  }) {
    return this.repo.getFiltered(query);
  }

  getAdminAll() {
    return this.repo.getAdminAll();
  }

  create(input: { name: string; created_by: string }) {
    return this.repo.create(input);
  }

  update(input: {
    id: string;
    patch: any;
    updated_by: string;
  }) {
    return this.repo.update(input.id, input.patch, input.updated_by);
  }
}
