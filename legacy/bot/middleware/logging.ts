// import { Context, MiddlewareFn } from "telegraf";
// import { FastifyInstance } from "fastify";

// export function loggingMiddleware(
//   server: FastifyInstance
// ): MiddlewareFn<Context> {
//   return async (ctx, next) => {
//     const start = Date.now();
//     const userId = ctx.from?.id;
//     const command =
//       ctx.message && "text" in ctx.message ? ctx.message.text : "unknown";

//     server.log.info(`Bot command: ${command} from user: ${userId}`);

//     await next();

//     const duration = Date.now() - start;
//     server.log.info(`Bot command completed in ${duration}ms`);
//   };
// }
