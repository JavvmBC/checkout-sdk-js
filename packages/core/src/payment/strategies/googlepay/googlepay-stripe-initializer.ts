import { round } from 'lodash';

import { Checkout } from '../../../checkout';
import { InvalidArgumentError } from '../../../common/error/errors';
import PaymentMethod from '../../payment-method';

import {
    BillingAddressFormat,
    GooglePayInitializer,
    GooglePaymentData,
    GooglePayPaymentDataRequestV2,
    TokenizePayload,
} from './googlepay';

export default class GooglePayStripeInitializer implements GooglePayInitializer {
    initialize(
        checkout: Checkout | undefined,
        paymentMethod: PaymentMethod,
        hasShippingAddress: boolean,
    ): Promise<GooglePayPaymentDataRequestV2> {
        return Promise.resolve(
            this._getGooglePayPaymentDataRequest(checkout, paymentMethod, hasShippingAddress),
        );
    }

    teardown(): Promise<void> {
        return Promise.resolve();
    }

    parseResponse(paymentData: GooglePaymentData): Promise<TokenizePayload> {
        try {
            const payload = JSON.parse(paymentData.paymentMethodData.tokenizationData.token);

            return Promise.resolve({
                nonce: payload.id,
                type: payload.type,
                details: {
                    cardType: payload.card.brand,
                    lastFour: payload.card.last4,
                },
            });
        } catch (err) {
            throw new InvalidArgumentError('Unable to parse response from Google Pay.');
        }
    }

    private _getGooglePayPaymentDataRequest(
        checkout: Checkout | undefined,
        paymentMethod: PaymentMethod,
        hasShippingAddress: boolean,
    ): GooglePayPaymentDataRequestV2 {
        const currencyCode = checkout?.cart.currency.code || '';
        const totalPrice = checkout?.outstandingBalance
            ? round(checkout.outstandingBalance, 2).toFixed(2)
            : '';
        const consignments = checkout?.consignments || [];

        const {
            initializationData: {
                googleMerchantName: merchantName,
                googleMerchantId: merchantId,
                platformToken: authJwt,
                stripeVersion,
                stripePublishableKey,
                stripeConnectedAccount,
                bopis,
            },
            supportedCards,
        } = paymentMethod;

        const isPickup = consignments.every((consignment) => consignment.selectedPickupOption);

        return {
            apiVersion: 2,
            apiVersionMinor: 0,
            merchantInfo: {
                authJwt,
                merchantId,
                merchantName,
            },
            allowedPaymentMethods: [
                {
                    type: 'CARD',
                    parameters: {
                        allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
                        allowedCardNetworks: supportedCards.map((card) =>
                            card === 'MC' ? 'MASTERCARD' : card,
                        ),
                        billingAddressRequired: true,
                        billingAddressParameters: {
                            format: BillingAddressFormat.Full,
                            phoneNumberRequired: true,
                        },
                    },
                    tokenizationSpecification: {
                        type: 'PAYMENT_GATEWAY',
                        parameters: {
                            gateway: 'stripe',
                            'stripe:version': stripeVersion,
                            'stripe:publishableKey': `${stripePublishableKey}/${stripeConnectedAccount}`,
                        },
                    },
                },
            ],
            transactionInfo: {
                currencyCode,
                totalPriceStatus: 'FINAL',
                totalPrice,
            },
            emailRequired: true,
            shippingAddressRequired:
                bopis?.enabled && isPickup && bopis?.requiredAddress === 'none'
                    ? false
                    : !hasShippingAddress,
            shippingAddressParameters: {
                phoneNumberRequired: true,
            },
        };
    }
}
