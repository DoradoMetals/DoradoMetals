import { Request, Response, NextFunction } from "express";
import { getEm } from "@/db/em";
import { User } from "@/db/entities/auth/users";

type HandlerContext<TService> = {
  req: Request;
  res: Response;
  query: any;
  body: any;
  params: any;
  service: TService;
  user: User | null;
};

export function controller<TService>(
  Service: new (em: any) => TService,
  handler: (ctx: HandlerContext<TService>) => Promise<any>,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const em = await getEm();
      const service = new Service(em);

      const user = (req as any).user ?? null;

      const result = await handler({
        req,
        res,
        query: req.query,
        body: req.body,
        params: req.params,
        service,
        user,
      });

      if (res.headersSent) return;
      res.json(result);
    } catch (err) {
      next(err);
    }
  };
}
