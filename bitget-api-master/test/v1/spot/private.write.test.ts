import { API_ERROR_CODE, SpotClient } from '../../../src';
import { sucessEmptyResponseObject } from '../../response.util';

describe('Private Spot REST API POST Endpoints', () => {
  const API_KEY = process.env.API_KEY_COM;
  const API_SECRET = process.env.API_SECRET_COM;
  const API_PASS = process.env.API_PASS_COM;

  it('should have api credentials to test with', () => {
    expect(API_KEY).toStrictEqual(expect.any(String));
    expect(API_SECRET).toStrictEqual(expect.any(String));
    expect(API_PASS).toStrictEqual(expect.any(String));
  });

  const api = new SpotClient({
    apiKey: API_KEY,
    apiSecret: API_SECRET,
    apiPass: API_PASS,
  });

  const symbol = 'BTCUSDT_SPBL';
  const coin = 'USDT';

  describe('transfers', () => {
    it('transfer()', async () => {
      try {
        expect(
          await api.transfer({
            amount: '100',
            coin,
            fromType: 'spot',
            toType: 'mix_usdt',
          }),
        ).toStrictEqual('');
      } catch (e) {
        // console.error('transfer: ', e);
        expect(e.body).toMatchObject({
          // not sure what this error means, probably no kyc. Seems to change?
          code: expect.stringMatching(/42013|43117|40035/gim),
        });
      }
    });

    it('transferV2()', async () => {
      try {
        expect(
          await api.transferV2({
            amount: '100',
            coin,
            fromType: 'spot',
            toType: 'mix_usdt',
          }),
        ).toStrictEqual('');
      } catch (e) {
        // console.error('transferV2: ', e);
        expect(e.body).toMatchObject({
          // not sure what this error means, probably no kyc. Seems to change?
          code: expect.stringMatching(/42013|43117|40035/gim),
        });
      }
    });

    it('subTransfer()', async () => {
      try {
        expect(
          await api.subTransfer({
            fromUserId: '123',
            toUserId: '456',
            amount: '100',
            clientOid: '123456',
            coin,
            fromType: 'spot',
            toType: 'mix_usdt',
          }),
        ).toStrictEqual('');
      } catch (e) {
        // console.error('transferV2: ', e);
        expect(e.body).toMatchObject({
          // not sure what this error means, probably no balance. Seems to change?
          code: API_ERROR_CODE.DISABLE_SUB_ACCESS,
        });
      }
    });

    it('withdraw()', async () => {
      try {
        expect(
          await api.withdraw({
            amount: '100',
            coin,
            chain: 'TRC20',
            address: '123456',
          }),
        ).toMatchObject({
          ...sucessEmptyResponseObject(),
          data: expect.any(Array),
        });
      } catch (e) {
        expect(e.body).toMatchObject({
          code: API_ERROR_CODE.INCORRECT_PERMISSIONS,
        });
      }
    });

    it.skip('withdrawV2()', async () => {
      try {
        expect(
          await api.withdrawV2({
            amount: '100',
            coin,
            chain: 'TRC20',
            address: '123456',
          }),
        ).toMatchObject({
          ...sucessEmptyResponseObject(),
          data: expect.any(Array),
        });
      } catch (e) {
        console.log(
          `"${expect.getState().currentTestName}"`,
          JSON.stringify(e.body),
        );

        expect(e.body).toMatchObject({
          code: API_ERROR_CODE.INCORRECT_PERMISSIONS,
        });
      }
    });

    it('innerWithdraw()', async () => {
      try {
        expect(await api.innerWithdraw(coin, '12345', '1')).toMatchObject({
          ...sucessEmptyResponseObject(),
          data: expect.any(Array),
        });
      } catch (e) {
        expect(e.body).toMatchObject({
          code: API_ERROR_CODE.INCORRECT_PERMISSIONS,
        });
      }
    });

    it.skip('innerWithdrawV2()', async () => {
      try {
        expect(await api.innerWithdrawV2(coin, '12345', '1')).toMatchObject({
          ...sucessEmptyResponseObject(),
          data: expect.any(Array),
        });
      } catch (e) {
        console.log(
          `"${expect.getState().currentTestName}"`,
          JSON.stringify(e.body),
        );

        expect(e.body).toMatchObject({
          code: API_ERROR_CODE.INCORRECT_PERMISSIONS,
        });
      }
    });
  });
  describe('orders', () => {
    it('submitOrder()', async () => {
      try {
        expect(
          await api.submitOrder({
            symbol,
            side: 'buy',
            orderType: 'market',
            quantity: '10',
            force: 'normal',
          }),
        ).toMatchObject({
          ...sucessEmptyResponseObject(),
          data: expect.any(Array),
        });
      } catch (e) {
        console.error(e.body);
        expect(e.body).toMatchObject({
          code: API_ERROR_CODE.INSUFFICIENT_BALANCE,
        });
      }
    });

    it.skip('batchSubmitOrder()', async () => {
      try {
        expect(
          await api.batchSubmitOrder(symbol, [
            {
              side: 'buy',
              orderType: 'market',
              size: '1',
              force: 'normal',
            },
          ]),
        ).toMatchObject({
          ...sucessEmptyResponseObject(),
          data: {
            resultList: expect.any(Array),
            failure: [{ errorCode: API_ERROR_CODE }],
          },
        });
      } catch (e) {
        // console.log(`fn() exception: `, e.body);

        expect(e?.body).toMatchObject({
          code: API_ERROR_CODE.ACCOUNT_KYC_REQUIRED,
        });
      }
    });

    it('cancelOrder()', async () => {
      try {
        expect(await api.cancelOrder(symbol, '123456')).toMatchObject({
          ...sucessEmptyResponseObject(),
          data: '123456', //expect.any(Array),
        });
      } catch (e) {
        console.log('cancelorder err', e);
        expect(e.body).toMatchObject({
          code: API_ERROR_CODE.ORDER_NOT_FOUND,
        });
      }
    });

    it('batchCancelOrder()', async () => {
      try {
        expect(await api.batchCancelOrder(symbol, ['123456'])).toMatchObject({
          ...sucessEmptyResponseObject(),
          data: expect.any(Array),
        });
      } catch (e) {
        expect(e.body).toMatchObject({
          code: API_ERROR_CODE.ORDER_NOT_FOUND,
        });
      }
    });
  });

  describe('plan orders', () => {
    let planOrderId: string;

    it.skip('submitPlanOrder()', async () => {
      try {
        const result = await api.submitPlanOrder({
          symbol,
          side: 'buy',
          orderType: 'market',
          size: 100,
          triggerPrice: 100,
          triggerType: 'fill_price',
        });

        planOrderId = result.data.orderId;
        expect(result).toMatchObject({
          code: API_ERROR_CODE.ACCOUNT_KYC_REQUIRED,
        });
      } catch (e) {
        // console.error('submitPlanOrder(): ', e);
        expect(e?.body).toMatchObject({
          code: API_ERROR_CODE.ACCOUNT_KYC_REQUIRED,
        });
      }
    });

    it('modifyPlanOrder()', async () => {
      try {
        expect(
          await api.modifyPlanOrder({
            orderType: 'market',
            triggerPrice: 100,
            orderId: '123456',
          }),
        ).toMatchObject({
          ...sucessEmptyResponseObject(),
          data: expect.any(Array),
        });
      } catch (e) {
        expect(e.body).toMatchObject({
          code: API_ERROR_CODE.PLAN_ORDER_NOT_FOUND,
        });
      }
    });

    it('cancelPlanOrder()', async () => {
      try {
        expect(
          await api.cancelPlanOrder({
            orderId: planOrderId || '123456',
          }),
        ).toMatchObject({
          ...sucessEmptyResponseObject(),
          data: expect.any(String),
        });
      } catch (e) {
        // console.error('cancelPlanOrder(): ', e);
        // expect(e).toBeNull();
        expect(e.body).toMatchObject({
          code: API_ERROR_CODE.PLAN_ORDER_NOT_FOUND,
        });
      }
    });
  });
});
