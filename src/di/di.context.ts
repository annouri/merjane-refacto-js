import {type Cradle, diContainer} from '@fastify/awilix';
import {asClass, asValue} from 'awilix';
import {type FastifyBaseLogger, type FastifyInstance} from 'fastify';
import {type INotificationService} from '@/services/notifications.port.js';
import {NotificationService} from '@/services/impl/notification.service.js';
import {type Database} from '@/db/type.js';
import {ProductService} from '@/services/impl/product.service.js';
import {OrderService} from '@/services/impl/order.service.js';
import {ProductRepository} from '@/repositories/product.repository.js';

declare module '@fastify/awilix' {

	interface Cradle { // eslint-disable-line @typescript-eslint/consistent-type-definitions
		logger: FastifyBaseLogger;
		db: Database;
		ns: INotificationService;
		ps: ProductService;
		os: OrderService;
		pr: ProductRepository;
	}
}

export async function configureDiContext(
	server: FastifyInstance,
): Promise<void> {
	diContainer.register({
		logger: asValue(server.log),
	});
	diContainer.register({
		db: asValue(server.database),
	});
	diContainer.register({
		ns: asClass(NotificationService),
	});
	diContainer.register({
		pr: asClass(ProductRepository),
	});
	diContainer.register({
		ps: asClass(ProductService),
	});
	diContainer.register({
		os: asClass(OrderService),
	});
}

export function resolve<Service extends keyof Cradle>(
	service: Service,
): Cradle[Service] {
	return diContainer.resolve(service);
}
