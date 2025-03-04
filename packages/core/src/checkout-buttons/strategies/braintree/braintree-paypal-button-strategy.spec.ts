import { createFormPoster, FormPoster } from '@bigcommerce/form-poster';
import { createRequestSender } from '@bigcommerce/request-sender';
import { getScriptLoader } from '@bigcommerce/script-loader';
import { EventEmitter } from 'events';

import { CartSource } from '@bigcommerce/checkout-sdk/payment-integration-api';

import { CartRequestSender } from '../../../cart';
import BuyNowCartRequestBody from '../../../cart/buy-now-cart-request-body';
import { getCart } from '../../../cart/carts.mock';
import {
    CheckoutActionCreator,
    CheckoutRequestSender,
    CheckoutStore,
    createCheckoutStore,
} from '../../../checkout';
import { getCheckoutStoreState } from '../../../checkout/checkouts.mock';
import {
    InvalidArgumentError,
    MissingDataError,
    MissingDataErrorType,
} from '../../../common/error/errors';
import { ConfigActionCreator, ConfigRequestSender } from '../../../config';
import { FormFieldsActionCreator, FormFieldsRequestSender } from '../../../form';
import { PaymentMethod } from '../../../payment';
import { getBraintree } from '../../../payment/payment-methods.mock';
import {
    BraintreeDataCollector,
    BraintreePaypalCheckout,
    BraintreePaypalCheckoutCreator,
    BraintreeScriptLoader,
    BraintreeSDKCreator,
} from '../../../payment/strategies/braintree';
import {
    getDataCollectorMock,
    getPayPalCheckoutCreatorMock,
    getPaypalCheckoutMock,
} from '../../../payment/strategies/braintree/braintree.mock';
import {
    PaypalButtonOptions,
    PaypalHostWindow,
    PaypalSDK,
} from '../../../payment/strategies/paypal';
import { getPaypalMock } from '../../../payment/strategies/paypal/paypal.mock';
import { getShippingAddress } from '../../../shipping/shipping-addresses.mock';
import { CheckoutButtonInitializeOptions } from '../../checkout-button-options';
import CheckoutButtonMethodType from '../checkout-button-method-type';

import { BraintreePaypalButtonInitializeOptions } from './braintree-paypal-button-options';
import BraintreePaypalButtonStrategy from './braintree-paypal-button-strategy';

describe('BraintreePaypalButtonStrategy', () => {
    let braintreeSDKCreator: BraintreeSDKCreator;
    let braintreeScriptLoader: BraintreeScriptLoader;
    let braintreePaypalCheckoutCreatorMock: BraintreePaypalCheckoutCreator;
    let braintreePaypalCheckoutMock: BraintreePaypalCheckout;
    let checkoutActionCreator: CheckoutActionCreator;
    let dataCollector: BraintreeDataCollector;
    let eventEmitter: EventEmitter;
    let formPoster: FormPoster;
    let paymentMethodMock: PaymentMethod;
    let paypalButtonElement: HTMLDivElement;
    let paypalMessageElement: HTMLDivElement;
    let paypalSdkMock: PaypalSDK;
    let store: CheckoutStore;
    let strategy: BraintreePaypalButtonStrategy;

    const defaultButtonContainerId = 'braintree-paypal-button-mock-id';
    const defaultMessageContainerId = 'braintree-paypal-message-mock-id';

    const braintreePaypalOptions: BraintreePaypalButtonInitializeOptions = {
        messagingContainerId: defaultMessageContainerId,
        style: {
            height: 45,
        },
        onAuthorizeError: jest.fn(),
        onPaymentError: jest.fn(),
        onError: jest.fn(),
    };

    const initializationOptions: CheckoutButtonInitializeOptions = {
        methodId: CheckoutButtonMethodType.BRAINTREE_PAYPAL,
        containerId: defaultButtonContainerId,
        braintreepaypal: braintreePaypalOptions,
    };

    const cartRequestSender = new CartRequestSender(createRequestSender());

    const buyNowCartMock = {
        ...getCart(),
        id: 999,
        source: CartSource.BuyNow,
    };

    const buyNowCartRequestBody: BuyNowCartRequestBody = {
        source: CartSource.BuyNow,
        lineItems: [
            {
                productId: 1,
                quantity: 2,
                optionSelections: {
                    optionId: 11,
                    optionValue: 11,
                },
            },
        ],
    };

    const buyNowInitializationOptions: CheckoutButtonInitializeOptions = {
        methodId: CheckoutButtonMethodType.BRAINTREE_PAYPAL,
        containerId: defaultButtonContainerId,
        braintreepaypal: {
            ...braintreePaypalOptions,
            currencyCode: 'USD',
            buyNowInitializeOptions: {
                getBuyNowCartRequestBody: jest.fn().mockReturnValue(buyNowCartRequestBody),
            },
        },
    };

    beforeEach(() => {
        braintreePaypalCheckoutMock = getPaypalCheckoutMock();
        braintreePaypalCheckoutCreatorMock = getPayPalCheckoutCreatorMock(
            braintreePaypalCheckoutMock,
            false,
        );
        dataCollector = getDataCollectorMock();
        paypalSdkMock = getPaypalMock();
        eventEmitter = new EventEmitter();

        store = createCheckoutStore(getCheckoutStoreState());
        checkoutActionCreator = new CheckoutActionCreator(
            new CheckoutRequestSender(createRequestSender()),
            new ConfigActionCreator(new ConfigRequestSender(createRequestSender())),
            new FormFieldsActionCreator(new FormFieldsRequestSender(createRequestSender())),
        );
        braintreeScriptLoader = new BraintreeScriptLoader(getScriptLoader());
        braintreeSDKCreator = new BraintreeSDKCreator(braintreeScriptLoader);
        formPoster = createFormPoster();

        (window as PaypalHostWindow).paypal = paypalSdkMock;

        strategy = new BraintreePaypalButtonStrategy(
            store,
            checkoutActionCreator,
            cartRequestSender,
            braintreeSDKCreator,
            formPoster,
            window,
        );

        paymentMethodMock = {
            ...getBraintree(),
            clientToken: 'myToken',
        };

        paypalButtonElement = document.createElement('div');
        paypalButtonElement.id = defaultButtonContainerId;
        document.body.appendChild(paypalButtonElement);

        paypalMessageElement = document.createElement('div');
        paypalMessageElement.id = defaultMessageContainerId;
        document.body.appendChild(paypalMessageElement);

        jest.spyOn(store, 'dispatch').mockReturnValue(Promise.resolve(store.getState()));
        jest.spyOn(store.getState().paymentMethods, 'getPaymentMethodOrThrow').mockReturnValue(
            paymentMethodMock,
        );
        jest.spyOn(braintreeSDKCreator, 'getClient').mockReturnValue(paymentMethodMock.clientToken);
        jest.spyOn(braintreeSDKCreator, 'getDataCollector').mockReturnValue(dataCollector);
        jest.spyOn(braintreeScriptLoader, 'loadPaypalCheckout').mockReturnValue(
            braintreePaypalCheckoutCreatorMock,
        );
        jest.spyOn(formPoster, 'postForm').mockImplementation(() => {});
        jest.spyOn(checkoutActionCreator, 'loadDefaultCheckout').mockImplementation(() => {});

        jest.spyOn(paypalSdkMock, 'Buttons').mockImplementation((options: PaypalButtonOptions) => {
            eventEmitter.on('createOrder', () => {
                if (options.createOrder) {
                    options.createOrder().catch(() => {});
                }
            });

            eventEmitter.on('approve', () => {
                if (options.onApprove) {
                    options.onApprove({ payerId: 'PAYER_ID' }).catch(() => {});
                }
            });

            return {
                isEligible: jest.fn(() => true),
                render: jest.fn(),
            };
        });

        jest.spyOn(paypalSdkMock, 'Messages').mockImplementation(() => ({
            render: jest.fn(),
        }));
    });

    afterEach(() => {
        jest.clearAllMocks();

        delete (window as PaypalHostWindow).paypal;

        if (document.getElementById(defaultButtonContainerId)) {
            document.body.removeChild(paypalButtonElement);
        }

        if (document.getElementById(defaultMessageContainerId)) {
            document.body.removeChild(paypalMessageElement);
        }
    });

    it('creates an instance of the braintree paypal checkout button strategy', () => {
        expect(strategy).toBeInstanceOf(BraintreePaypalButtonStrategy);
    });

    describe('#initialize()', () => {
        it('throws error if methodId is not provided', async () => {
            const options = {
                containerId: defaultButtonContainerId,
            } as CheckoutButtonInitializeOptions;

            try {
                await strategy.initialize(options);
            } catch (error) {
                expect(error).toBeInstanceOf(InvalidArgumentError);
            }
        });

        it('throws an error if containerId is not provided', async () => {
            const options = {
                methodId: CheckoutButtonMethodType.BRAINTREE_PAYPAL,
            } as CheckoutButtonInitializeOptions;

            try {
                await strategy.initialize(options);
            } catch (error) {
                expect(error).toBeInstanceOf(InvalidArgumentError);
            }
        });

        it('throws an error if braintreepaypal is not provided', async () => {
            const options = {
                containerId: defaultButtonContainerId,
                methodId: CheckoutButtonMethodType.BRAINTREE_PAYPAL,
            } as CheckoutButtonInitializeOptions;

            try {
                await strategy.initialize(options);
            } catch (error) {
                expect(error).toBeInstanceOf(InvalidArgumentError);
            }
        });

        it('throws error if client token is missing', async () => {
            paymentMethodMock.clientToken = undefined;

            try {
                await strategy.initialize(initializationOptions);
            } catch (error) {
                expect(error).toBeInstanceOf(MissingDataError);
            }
        });

        it('initializes braintree sdk creator', async () => {
            braintreeSDKCreator.initialize = jest.fn();
            braintreeSDKCreator.getPaypalCheckout = jest.fn();

            await strategy.initialize(initializationOptions);

            expect(braintreeSDKCreator.initialize).toHaveBeenCalledWith(
                paymentMethodMock.clientToken,
            );
        });

        it('initializes braintree paypal checkout', async () => {
            braintreeSDKCreator.initialize = jest.fn();
            braintreeSDKCreator.getPaypalCheckout = jest.fn();

            await strategy.initialize(initializationOptions);

            expect(braintreeSDKCreator.initialize).toHaveBeenCalledWith(
                paymentMethodMock.clientToken,
            );
            expect(braintreeSDKCreator.getPaypalCheckout).toHaveBeenCalled();
        });

        it('does not load default checkout for BuyNowFlow', async () => {
            await strategy.initialize(buyNowInitializationOptions);

            expect(checkoutActionCreator.loadDefaultCheckout).not.toHaveBeenCalled();
        });

        it('throws an error if buy now cart request body data is not provided', async () => {
            const buyNowInitializationOptions: CheckoutButtonInitializeOptions = {
                methodId: CheckoutButtonMethodType.BRAINTREE_PAYPAL,
                containerId: defaultButtonContainerId,
                braintreepaypal: {
                    ...braintreePaypalOptions,
                    currencyCode: 'USD',
                    buyNowInitializeOptions: {
                        getBuyNowCartRequestBody: jest.fn().mockReturnValue(undefined),
                    },
                },
            };

            await strategy.initialize(buyNowInitializationOptions);

            eventEmitter.emit('createOrder');

            await new Promise((resolve) => process.nextTick(resolve));

            expect(braintreePaypalOptions.onPaymentError).toHaveBeenCalledWith(
                new MissingDataError(MissingDataErrorType.MissingCart),
            );
        });

        it('creates order with Buy Now cart id (Buy Now flow)', async () => {
            jest.spyOn(cartRequestSender, 'createBuyNowCart').mockReturnValue({
                body: buyNowCartMock,
            });

            await strategy.initialize(buyNowInitializationOptions);

            eventEmitter.emit('createOrder');

            await new Promise((resolve) => process.nextTick(resolve));

            eventEmitter.emit('approve');

            await new Promise((resolve) => process.nextTick(resolve));

            expect(formPoster.postForm).toHaveBeenCalledWith(
                '/checkout.php',
                expect.objectContaining({
                    cart_id: buyNowCartMock.id,
                }),
            );
        });

        it('calls braintree paypal checkout create method', async () => {
            await strategy.initialize(initializationOptions);

            expect(braintreePaypalCheckoutCreatorMock.create).toHaveBeenCalled();
        });

        it('calls onError callback option if the error was caught on paypal checkout creation', async () => {
            braintreePaypalCheckoutCreatorMock = getPayPalCheckoutCreatorMock(undefined, true);

            jest.spyOn(braintreeScriptLoader, 'loadPaypalCheckout').mockReturnValue(
                braintreePaypalCheckoutCreatorMock,
            );

            await strategy.initialize(initializationOptions);

            expect(initializationOptions.braintreepaypal?.onError).toHaveBeenCalled();
        });

        it('renders PayPal checkout message', async () => {
            const cartMock = getCart();

            jest.spyOn(store.getState().cart, 'getCartOrThrow').mockReturnValue(cartMock);

            await strategy.initialize(initializationOptions);

            expect(paypalSdkMock.Messages).toHaveBeenCalledWith({
                amount: 190,
                placement: 'cart',
            });
        });

        it('renders PayPal checkout button', async () => {
            await strategy.initialize(initializationOptions);

            expect(paypalSdkMock.Buttons).toHaveBeenCalledWith({
                commit: false,
                createOrder: expect.any(Function),
                env: 'sandbox',
                fundingSource: paypalSdkMock.FUNDING.PAYPAL,
                onApprove: expect.any(Function),
                style: {
                    shape: 'rect',
                    height: 45,
                },
            });
        });

        it('renders PayPal checkout button in production environment if payment method is in test mode', async () => {
            paymentMethodMock.config.testMode = false;

            await strategy.initialize(initializationOptions);

            expect(paypalSdkMock.Buttons).toHaveBeenCalledWith(
                expect.objectContaining({ env: 'production' }),
            );
        });

        it('loads checkout details when customer is ready to pay', async () => {
            await strategy.initialize(initializationOptions);

            eventEmitter.emit('createOrder');

            await new Promise((resolve) => process.nextTick(resolve));

            expect(checkoutActionCreator.loadDefaultCheckout).toHaveBeenCalledTimes(2);
        });

        it('sets up PayPal payment flow with provided address', async () => {
            jest.spyOn(store.getState().checkout, 'getCheckoutOrThrow').mockReturnValue({
                outstandingBalance: 22,
            });

            await strategy.initialize({
                ...initializationOptions,
                braintreepaypal: {
                    ...initializationOptions.braintreepaypal,
                    shippingAddress: {
                        ...getShippingAddress(),
                        address1: 'a1',
                        address2: 'a2',
                        city: 'c',
                        countryCode: 'AU',
                        phone: '0123456',
                        postalCode: '2000',
                        stateOrProvinceCode: 'NSW',
                        firstName: 'foo',
                        lastName: 'bar',
                    },
                },
            });

            eventEmitter.emit('createOrder');

            await new Promise((resolve) => process.nextTick(resolve));

            expect(braintreePaypalCheckoutMock.createPayment).toHaveBeenCalledWith(
                expect.objectContaining({
                    shippingAddressOverride: {
                        city: 'c',
                        countryCode: 'AU',
                        line1: 'a1',
                        line2: 'a2',
                        phone: '0123456',
                        postalCode: '2000',
                        recipientName: 'foo bar',
                        state: 'NSW',
                    },
                }),
            );
        });

        it('sets up PayPal payment flow with no address when null is passed', async () => {
            jest.spyOn(store.getState().customer, 'getCustomer').mockReturnValue(undefined);

            await strategy.initialize({
                ...initializationOptions,
                braintreepaypal: {
                    ...initializationOptions.braintreepaypal,
                    shippingAddress: null,
                },
            });

            eventEmitter.emit('createOrder');

            await new Promise((resolve) => process.nextTick(resolve));

            expect(braintreePaypalCheckoutMock.createPayment).toHaveBeenCalledWith(
                expect.objectContaining({
                    shippingAddressOverride: undefined,
                }),
            );
        });

        it('sets up PayPal payment flow with current checkout details when customer is ready to pay', async () => {
            await strategy.initialize(initializationOptions);

            eventEmitter.emit('createOrder');

            await new Promise((resolve) => process.nextTick(resolve));

            expect(braintreePaypalCheckoutMock.createPayment).toHaveBeenCalledWith({
                amount: 190,
                currency: 'USD',
                enableShippingAddress: true,
                flow: 'checkout',
                offerCredit: false,
                shippingAddressEditable: false,
                shippingAddressOverride: {
                    city: 'Some City',
                    countryCode: 'US',
                    line1: '12345 Testing Way',
                    line2: '',
                    phone: '555-555-5555',
                    postalCode: '95555',
                    recipientName: 'Test Tester',
                    state: 'CA',
                },
            });
        });

        it('triggers error callback if unable to set up payment flow', async () => {
            const expectedError = new Error('Unable to set up payment flow');

            jest.spyOn(braintreePaypalCheckoutMock, 'createPayment').mockImplementation(() =>
                Promise.reject(expectedError),
            );

            await strategy.initialize(initializationOptions);

            eventEmitter.emit('createOrder');

            await new Promise((resolve) => process.nextTick(resolve));

            expect(braintreePaypalOptions.onPaymentError).toHaveBeenCalledWith(expectedError);
        });

        it('tokenizes PayPal payment details when authorization event is triggered', async () => {
            await strategy.initialize(initializationOptions);

            eventEmitter.emit('approve');

            await new Promise((resolve) => process.nextTick(resolve));

            expect(braintreePaypalCheckoutMock.tokenizePayment).toHaveBeenCalledWith({
                payerId: 'PAYER_ID',
            });
        });

        it('posts payment details to server to set checkout data when PayPal payment details are tokenized', async () => {
            await strategy.initialize(initializationOptions);

            eventEmitter.emit('approve');

            await new Promise((resolve) => process.nextTick(resolve));

            expect(formPoster.postForm).toHaveBeenCalledWith(
                '/checkout.php',
                expect.objectContaining({
                    payment_type: 'paypal',
                    provider: 'braintreepaypal',
                    action: 'set_external_checkout',
                    device_data: dataCollector.deviceData,
                    nonce: 'NONCE',
                    billing_address: JSON.stringify({
                        email: 'foo@bar.com',
                        first_name: 'Foo',
                        last_name: 'Bar',
                        address_line_1: '56789 Testing Way',
                        address_line_2: 'Level 2',
                        city: 'Some Other City',
                        state: 'Arizona',
                        country_code: 'US',
                        postal_code: '96666',
                    }),
                    shipping_address: JSON.stringify({
                        email: 'foo@bar.com',
                        first_name: 'Hello',
                        last_name: 'World',
                        address_line_1: '12345 Testing Way',
                        address_line_2: 'Level 1',
                        city: 'Some City',
                        state: 'California',
                        country_code: 'US',
                        postal_code: '95555',
                    }),
                }),
            );
        });

        it('posts payment details to server to process payment if `shouldProcessPayment` is passed when PayPal payment details are tokenized', async () => {
            const options = {
                ...initializationOptions,
                braintreepaypal: {
                    ...braintreePaypalOptions,
                    shouldProcessPayment: true,
                },
            };

            await strategy.initialize(options);

            eventEmitter.emit('approve');

            await new Promise((resolve) => process.nextTick(resolve));

            expect(formPoster.postForm).toHaveBeenCalledWith(
                '/checkout.php',
                expect.objectContaining({
                    payment_type: 'paypal',
                    provider: 'braintreepaypal',
                    action: 'process_payment',
                    device_data: dataCollector.deviceData,
                    nonce: 'NONCE',
                    billing_address: JSON.stringify({
                        email: 'foo@bar.com',
                        first_name: 'Foo',
                        last_name: 'Bar',
                        address_line_1: '56789 Testing Way',
                        address_line_2: 'Level 2',
                        city: 'Some Other City',
                        state: 'Arizona',
                        country_code: 'US',
                        postal_code: '96666',
                    }),
                    shipping_address: JSON.stringify({
                        email: 'foo@bar.com',
                        first_name: 'Hello',
                        last_name: 'World',
                        address_line_1: '12345 Testing Way',
                        address_line_2: 'Level 1',
                        city: 'Some City',
                        state: 'California',
                        country_code: 'US',
                        postal_code: '95555',
                    }),
                }),
            );
        });

        it('triggers error callback if unable to tokenize payment', async () => {
            const expectedError = new Error('Unable to tokenize');

            jest.spyOn(braintreePaypalCheckoutMock, 'tokenizePayment').mockReturnValue(
                Promise.reject(expectedError),
            );

            await strategy.initialize(initializationOptions);

            eventEmitter.emit('approve');

            await new Promise((resolve) => process.nextTick(resolve));

            expect(braintreePaypalOptions.onAuthorizeError).toHaveBeenCalledWith(expectedError);
        });
    });

    describe('#deinitialize()', () => {
        it('teardowns braintree sdk creator on strategy deinitialize', async () => {
            braintreeSDKCreator.teardown = jest.fn();

            await strategy.initialize(initializationOptions);
            await strategy.deinitialize();

            expect(braintreeSDKCreator.teardown).toHaveBeenCalled();
        });
    });
});
