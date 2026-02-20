import { controller } from '@/shared/http/controller';
import { BullionService } from './service';

export class BullionController {

  getAll = controller(BullionService, async ({ service }) => {
    return service.getAll();
  });

  getSellable = controller(BullionService, async ({ service }) => {
    return service.getSellable();
  });

  getHomepage = controller(BullionService, async ({ service }) => {
    return service.getHomepage();
  });

  getFromSlug = controller(BullionService, async ({ query, service }) => {
    return service.getFromSlug(query);
  });

  getFiltered = controller(BullionService, async ({ query, service }) => {
    return service.getFiltered(query);
  });

  getAdminAll = controller(BullionService, async ({ service }) => {
    return service.getAdminAll();
  });

  create = controller(BullionService, async ({ body, service, user }) => {
    return service.create({
      name: body.name,
      created_by: user?.name ?? '',
    });
  });

  update = controller(BullionService, async ({ body, service, user }) => {
    return service.update({
      id: body.id,
      patch: body.patch,
      updated_by: user?.name ?? '',
    });
  });
}
