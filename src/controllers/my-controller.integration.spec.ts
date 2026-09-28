import {
	describe, it, expect, beforeEach,
	afterEach,
} from 'vitest';
import {type FastifyInstance} from 'fastify';
import supertest from 'supertest';
import {eq} from 'drizzle-orm';
import {type DeepMockProxy, mockDeep} from 'vitest-mock-extended';
import {asValue} from 'awilix';
import {type INotificationService} from '@/services/notifications.port.js';
import {
	type ProductInsert,
	products,
	orders,
	ordersToProducts,
} from '@/db/schema.js';
import {type Database} from '@/db/type.js';
import {buildFastify} from '@/fastify.js';

describe('MyController Integration Tests', () => {
	let fastify: FastifyInstance;
	let database: Database;
	let notificationServiceMock: DeepMockProxy<INotificationService>;

	beforeEach(async () => {
		notificationServiceMock = mockDeep<INotificationService>();

		fastify = await buildFastify();
		fastify.diContainer.register({
			ns: asValue(notificationServiceMock as INotificationService),
		});
		await fastify.ready();
		database = fastify.database;
	});
	afterEach(async () => {
		await fastify.close();
	});

	it('ProcessOrderShouldReturn', async () => {
		const client = supertest(fastify.server);
		const allProducts = createProducts();
		const orderId = database.transaction(tx => {
			const productList = tx.insert(products).values(allProducts).returning({productId: products.id}).all();
			const order = tx.insert(orders).values([{}]).returning({orderId: orders.id}).get();
			tx.insert(ordersToProducts).values(productList.map(p => ({orderId: order!.orderId, productId: p.productId}))).run();
			return order!.orderId;
		});

		await client.post(`/orders/${orderId}/processOrder`).expect(200).expect('Content-Type', /application\/json/);

		const resultOrder = await database.query.orders.findFirst({where: eq(orders.id, orderId)});
		expect(resultOrder!.id).toBe(orderId);
	});

	// NORMAL Product Tests
	it('NORMAL - en stock : available décrémenté', async () => {
		const client = supertest(fastify.server);
		const product: ProductInsert = {
			leadTime: 15, available: 30, type: 'NORMAL', name: 'USB Cable',
		};

		const {orderId, productId} = database.transaction(tx => {
			const [insertedProduct] = tx.insert(products).values(product).returning({productId: products.id}).all();
			const order = tx.insert(orders).values([{}]).returning({orderId: orders.id}).get();
			tx.insert(ordersToProducts).values([{orderId: order!.orderId, productId: insertedProduct.productId}]).run();
			return {orderId: order!.orderId, productId: insertedProduct.productId};
		});

		await client.post(`/orders/${orderId}/processOrder`).expect(200);

		const updatedProduct = await database.query.products.findFirst({where: eq(products.id, productId)});
		expect(updatedProduct!.available).toBe(29);
		expect(notificationServiceMock.sendDelayNotification).not.toHaveBeenCalled();
		expect(notificationServiceMock.sendOutOfStockNotification).not.toHaveBeenCalled();
		expect(notificationServiceMock.sendExpirationNotification).not.toHaveBeenCalled();
	});

	it('NORMAL - en rupture avec leadTime > 0 : notification de délai, stock inchangé, leadTime mis à jour', async () => {
		const client = supertest(fastify.server);
		const product: ProductInsert = {
			leadTime: 10, available: 0, type: 'NORMAL', name: 'USB Dongle',
		};

		const {orderId, productId} = database.transaction(tx => {
			const [insertedProduct] = tx.insert(products).values(product).returning({productId: products.id}).all();
			const order = tx.insert(orders).values([{}]).returning({orderId: orders.id}).get();
			tx.insert(ordersToProducts).values([{orderId: order!.orderId, productId: insertedProduct.productId}]).run();
			return {orderId: order!.orderId, productId: insertedProduct.productId};
		});

		await client.post(`/orders/${orderId}/processOrder`).expect(200);

		const updatedProduct = await database.query.products.findFirst({where: eq(products.id, productId)});
		expect(updatedProduct!.available).toBe(0);
		expect(updatedProduct!.leadTime).toBe(10);
		expect(notificationServiceMock.sendDelayNotification).toHaveBeenCalledWith(10, 'USB Dongle');
		expect(notificationServiceMock.sendOutOfStockNotification).not.toHaveBeenCalled();
		expect(notificationServiceMock.sendExpirationNotification).not.toHaveBeenCalled();
	});

	it('NORMAL - en rupture avec leadTime = 0 : aucune action', async () => {
		const client = supertest(fastify.server);
		const product: ProductInsert = {
			leadTime: 0, available: 0, type: 'NORMAL', name: 'Keyboard',
		};

		const {orderId, productId} = database.transaction(tx => {
			const [insertedProduct] = tx.insert(products).values(product).returning({productId: products.id}).all();
			const order = tx.insert(orders).values([{}]).returning({orderId: orders.id}).get();
			tx.insert(ordersToProducts).values([{orderId: order!.orderId, productId: insertedProduct.productId}]).run();
			return {orderId: order!.orderId, productId: insertedProduct.productId};
		});

		await client.post(`/orders/${orderId}/processOrder`).expect(200);

		const updatedProduct = await database.query.products.findFirst({where: eq(products.id, productId)});
		expect(updatedProduct!.available).toBe(0);
		expect(notificationServiceMock.sendDelayNotification).not.toHaveBeenCalled();
		expect(notificationServiceMock.sendOutOfStockNotification).not.toHaveBeenCalled();
		expect(notificationServiceMock.sendExpirationNotification).not.toHaveBeenCalled();
	});

	// SEASONAL Product Tests
	it('SEASONAL - en saison et en stock : available décrémenté', async () => {
		const client = supertest(fastify.server);
		const d = 24 * 60 * 60 * 1000;
		const product: ProductInsert = {
			leadTime: 15,
			available: 30,
			type: 'SEASONAL',
			name: 'Watermelon',
			seasonStartDate: new Date(Date.now() - (2 * d)),
			seasonEndDate: new Date(Date.now() + (58 * d)),
		};

		const {orderId, productId} = database.transaction(tx => {
			const [insertedProduct] = tx.insert(products).values(product).returning({productId: products.id}).all();
			const order = tx.insert(orders).values([{}]).returning({orderId: orders.id}).get();
			tx.insert(ordersToProducts).values([{orderId: order!.orderId, productId: insertedProduct.productId}]).run();
			return {orderId: order!.orderId, productId: insertedProduct.productId};
		});

		await client.post(`/orders/${orderId}/processOrder`).expect(200);

		const updatedProduct = await database.query.products.findFirst({where: eq(products.id, productId)});
		expect(updatedProduct!.available).toBe(29);
		expect(notificationServiceMock.sendDelayNotification).not.toHaveBeenCalled();
		expect(notificationServiceMock.sendOutOfStockNotification).not.toHaveBeenCalled();
		expect(notificationServiceMock.sendExpirationNotification).not.toHaveBeenCalled();
	});

	it('SEASONAL - en saison, en rupture, délai dans la saison : notification de délai', async () => {
		const client = supertest(fastify.server);
		const d = 24 * 60 * 60 * 1000;
		const product: ProductInsert = {
			leadTime: 10,
			available: 0,
			type: 'SEASONAL',
			name: 'Strawberry',
			seasonStartDate: new Date(Date.now() - (2 * d)),
			seasonEndDate: new Date(Date.now() + (58 * d)),
		};

		const {orderId, productId} = database.transaction(tx => {
			const [insertedProduct] = tx.insert(products).values(product).returning({productId: products.id}).all();
			const order = tx.insert(orders).values([{}]).returning({orderId: orders.id}).get();
			tx.insert(ordersToProducts).values([{orderId: order!.orderId, productId: insertedProduct.productId}]).run();
			return {orderId: order!.orderId, productId: insertedProduct.productId};
		});

		await client.post(`/orders/${orderId}/processOrder`).expect(200);

		const updatedProduct = await database.query.products.findFirst({where: eq(products.id, productId)});
		expect(updatedProduct!.available).toBe(0);
		expect(updatedProduct!.leadTime).toBe(10);
		expect(notificationServiceMock.sendDelayNotification).toHaveBeenCalledWith(10, 'Strawberry');
		expect(notificationServiceMock.sendOutOfStockNotification).not.toHaveBeenCalled();
		expect(notificationServiceMock.sendExpirationNotification).not.toHaveBeenCalled();
	});

	it('SEASONAL - en saison, en rupture, délai au-delà de la fin de saison : notification out-of-stock', async () => {
		const client = supertest(fastify.server);
		const d = 24 * 60 * 60 * 1000;
		const product: ProductInsert = {
			leadTime: 90,
			available: 0,
			type: 'SEASONAL',
			name: 'Blueberry',
			seasonStartDate: new Date(Date.now() - (2 * d)),
			seasonEndDate: new Date(Date.now() + (20 * d)),
		};

		const {orderId, productId} = database.transaction(tx => {
			const [insertedProduct] = tx.insert(products).values(product).returning({productId: products.id}).all();
			const order = tx.insert(orders).values([{}]).returning({orderId: orders.id}).get();
			tx.insert(ordersToProducts).values([{orderId: order!.orderId, productId: insertedProduct.productId}]).run();
			return {orderId: order!.orderId, productId: insertedProduct.productId};
		});

		await client.post(`/orders/${orderId}/processOrder`).expect(200);

		const updatedProduct = await database.query.products.findFirst({where: eq(products.id, productId)});
		expect(updatedProduct!.available).toBe(0);
		expect(notificationServiceMock.sendOutOfStockNotification).toHaveBeenCalledWith('Blueberry');
		expect(notificationServiceMock.sendDelayNotification).not.toHaveBeenCalled();
		expect(notificationServiceMock.sendExpirationNotification).not.toHaveBeenCalled();
	});

	it('SEASONAL - avant le début de la saison avec stock : notification out-of-stock', async () => {
		const client = supertest(fastify.server);
		const d = 24 * 60 * 60 * 1000;
		const product: ProductInsert = {
			leadTime: 15,
			available: 30,
			type: 'SEASONAL',
			name: 'Grapes',
			seasonStartDate: new Date(Date.now() + (180 * d)),
			seasonEndDate: new Date(Date.now() + (240 * d)),
		};

		const {orderId, productId} = database.transaction(tx => {
			const [insertedProduct] = tx.insert(products).values(product).returning({productId: products.id}).all();
			const order = tx.insert(orders).values([{}]).returning({orderId: orders.id}).get();
			tx.insert(ordersToProducts).values([{orderId: order!.orderId, productId: insertedProduct.productId}]).run();
			return {orderId: order!.orderId, productId: insertedProduct.productId};
		});

		await client.post(`/orders/${orderId}/processOrder`).expect(200);

		const updatedProduct = await database.query.products.findFirst({where: eq(products.id, productId)});
		expect(updatedProduct!.available).toBe(30);
		expect(notificationServiceMock.sendOutOfStockNotification).toHaveBeenCalledWith('Grapes');
		expect(notificationServiceMock.sendDelayNotification).not.toHaveBeenCalled();
		expect(notificationServiceMock.sendExpirationNotification).not.toHaveBeenCalled();
	});

	// EXPIRABLE Product Tests
	it('EXPIRABLE - non expiré et en stock : available décrémenté', async () => {
		const client = supertest(fastify.server);
		const d = 24 * 60 * 60 * 1000;
		const product: ProductInsert = {
			leadTime: 15,
			available: 30,
			type: 'EXPIRABLE',
			name: 'Butter',
			expiryDate: new Date(Date.now() + (26 * d)),
		};

		const {orderId, productId} = database.transaction(tx => {
			const [insertedProduct] = tx.insert(products).values(product).returning({productId: products.id}).all();
			const order = tx.insert(orders).values([{}]).returning({orderId: orders.id}).get();
			tx.insert(ordersToProducts).values([{orderId: order!.orderId, productId: insertedProduct.productId}]).run();
			return {orderId: order!.orderId, productId: insertedProduct.productId};
		});

		await client.post(`/orders/${orderId}/processOrder`).expect(200);

		const updatedProduct = await database.query.products.findFirst({where: eq(products.id, productId)});
		expect(updatedProduct!.available).toBe(29);
		expect(notificationServiceMock.sendDelayNotification).not.toHaveBeenCalled();
		expect(notificationServiceMock.sendOutOfStockNotification).not.toHaveBeenCalled();
		expect(notificationServiceMock.sendExpirationNotification).not.toHaveBeenCalled();
	});

	it('EXPIRABLE - expiré : notification expiration, available mis à 0', async () => {
		const client = supertest(fastify.server);
		const d = 24 * 60 * 60 * 1000;
		const product: ProductInsert = {
			leadTime: 90,
			available: 6,
			type: 'EXPIRABLE',
			name: 'Milk',
			expiryDate: new Date(Date.now() - (2 * d)),
		};

		const {orderId, productId} = database.transaction(tx => {
			const [insertedProduct] = tx.insert(products).values(product).returning({productId: products.id}).all();
			const order = tx.insert(orders).values([{}]).returning({orderId: orders.id}).get();
			tx.insert(ordersToProducts).values([{orderId: order!.orderId, productId: insertedProduct.productId}]).run();
			return {orderId: order!.orderId, productId: insertedProduct.productId};
		});

		await client.post(`/orders/${orderId}/processOrder`).expect(200);

		const updatedProduct = await database.query.products.findFirst({where: eq(products.id, productId)});
		expect(updatedProduct!.available).toBe(0);
		expect(notificationServiceMock.sendExpirationNotification).toHaveBeenCalledWith('Milk', product.expiryDate);
		expect(notificationServiceMock.sendDelayNotification).not.toHaveBeenCalled();
		expect(notificationServiceMock.sendOutOfStockNotification).not.toHaveBeenCalled();
	});

	it('EXPIRABLE - non expiré et en rupture : état final observable', async () => {
		const client = supertest(fastify.server);
		const d = 24 * 60 * 60 * 1000;
		const product: ProductInsert = {
			leadTime: 15,
			available: 0,
			type: 'EXPIRABLE',
			name: 'Yogurt',
			expiryDate: new Date(Date.now() + (10 * d)),
		};

		const {orderId, productId} = database.transaction(tx => {
			const [insertedProduct] = tx.insert(products).values(product).returning({productId: products.id}).all();
			const order = tx.insert(orders).values([{}]).returning({orderId: orders.id}).get();
			tx.insert(ordersToProducts).values([{orderId: order!.orderId, productId: insertedProduct.productId}]).run();
			return {orderId: order!.orderId, productId: insertedProduct.productId};
		});

		await client.post(`/orders/${orderId}/processOrder`).expect(200);

		const updatedProduct = await database.query.products.findFirst({where: eq(products.id, productId)});
		expect(updatedProduct!.available).toBe(0);
		expect(notificationServiceMock.sendExpirationNotification).toHaveBeenCalledWith('Yogurt', product.expiryDate);
		expect(notificationServiceMock.sendDelayNotification).not.toHaveBeenCalled();
		expect(notificationServiceMock.sendOutOfStockNotification).not.toHaveBeenCalled();
	});

	function createProducts(): ProductInsert[] {
		const d = 24 * 60 * 60 * 1000;
		return [
			{
				leadTime: 15, available: 30, type: 'NORMAL', name: 'USB Cable',
			},
			{
				leadTime: 10, available: 0, type: 'NORMAL', name: 'USB Dongle',
			},
			{
				leadTime: 15, available: 30, type: 'EXPIRABLE', name: 'Butter', expiryDate: new Date(Date.now() + (26 * d)),
			},
			{
				leadTime: 90, available: 6, type: 'EXPIRABLE', name: 'Milk', expiryDate: new Date(Date.now() - (2 * d)),
			},
			{
				leadTime: 15, available: 30, type: 'SEASONAL', name: 'Watermelon', seasonStartDate: new Date(Date.now() - (2 * d)), seasonEndDate: new Date(Date.now() + (58 * d)),
			},
			{
				leadTime: 15, available: 30, type: 'SEASONAL', name: 'Grapes', seasonStartDate: new Date(Date.now() + (180 * d)), seasonEndDate: new Date(Date.now() + (240 * d)),
			},
		];
	}
});
