import { EntityManager } from "@mikro-orm/postgresql";
import { Bullion } from "@/db/entities/core/bullion";
import { Metal } from "@/db/entities/core/metals";
import { Mint } from "@/db/entities/core/mints";
import { CreateBullionInput } from "@/features/bullion/types";

export class BullionRepo {
  constructor(private readonly em: EntityManager) {}

  getAllPublic() {
    return this.em.find(
      Bullion,
      { display: true },
      {
        populate: ["metal", "mint"],
        orderBy: { name: "asc" },
      },
    );
  }

  getSellable() {
    return this.em.find(
      Bullion,
      { sell_display: true },
      {
        populate: ["metal", "mint"],
        orderBy: { name: "asc" },
      },
    );
  }

  getHomepage() {
    return this.em.find(
      Bullion,
      { display: true, homepage_display: true },
      {
        populate: ["metal", "mint"],
        orderBy: { name: "asc" },
      },
    );
  }

  getBySlug(slug: string) {
    return this.em.findOne(
      Bullion,
      { slug, display: true },
      { populate: ["metal", "mint"] },
    );
  }

  getFiltered(input: {
    metal_type?: string;
    filter_category?: string;
    type?: string;
  }) {
    const qb = this.em
      .createQueryBuilder(Bullion, "b")
      .leftJoinAndSelect("b.metal", "m")
      .leftJoinAndSelect("b.mint", "mint")
      .where({ display: true });

    if (input.metal_type) {
      qb.andWhere({ metal: { type: input.metal_type } });
    }

    if (input.filter_category) {
      qb.andWhere({ filter_category: input.filter_category });
    }

    if (input.type) {
      qb.andWhere({ type: input.type });
    }

    return qb.orderBy({ name: "asc" }).getResult();
  }

  getAdminAll() {
    return this.em.find(
      Bullion,
      {},
      {
        populate: ["metal", "mint"],
        orderBy: { name: "asc" },
      },
    );
  }

  async create(input: CreateBullionInput) {
    const bullion = this.em.create(Bullion, {
      name: input.name,
      metal: this.em.getReference(Metal, input.metal_id),
      mint: this.em.getReference(Mint, input.mint_id),
      created_by: input.created_by,
      updated_by: input.created_by,
    });

    await this.em.flush();
    return bullion;
  }

  async update(id: string, patch: Partial<Bullion>, updated_by: string) {
    const bullion = await this.em.findOneOrFail(Bullion, { id });

    this.em.assign(bullion, {
      ...patch,
      updated_by,
    });

    await this.em.flush();
    return bullion;
  }
}
