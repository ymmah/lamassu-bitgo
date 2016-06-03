var _ = require('lodash')
var bitgolib = require('bitgo')
var pjson = require('./package.json')
var userAgent = 'Lamassu-BitGo/' + pjson.version
var BigNumber = require('bignumber.js')

exports.NAME = 'BitGo'
exports.SUPPORTED_MODULES = ['wallet']

var pluginConfig = {
  // token: <your BitGo access token>
  // walletId: <your wallet id>,
  // walletPassphrase: <your wallet passphrase>
}

var bitgo

var getWallet = function () {
  return bitgo.wallets().get({ id: pluginConfig.walletId })
}

exports.config = function config (localConfig) {
  if (localConfig) {
    _.merge(pluginConfig, localConfig)
  }
  if (pluginConfig.token && pluginConfig.walletId && pluginConfig.walletPassphrase) {
    bitgo = new bitgolib.BitGo({ env: 'prod', userAgent: userAgent })
    bitgo._token = pluginConfig.token
  } else {
    throw new Error('BitGo config requires token and walletId')
  }
}

exports.sendBitcoins = function sendBitcoins (address, satoshis, fee, callback) {
  return getWallet()
    .then(function (wallet) {
      var params = {
        address: address,
        amount: satoshis,
        // fee: fee,  // TODO: support fee in sendCoins
        walletPassphrase: pluginConfig.walletPassphrase
      }
      return wallet.sendCoins(params)
    })
    .then(function (result) {
      return result.hash
    })
    .catch(function (err) {
      if (err.message === 'Insufficient funds') {
        err.name = 'InsufficientFunds'
      }
      throw err
    })
    .nodeify(callback)
}

exports.balance = function balance (callback) {
  return getWallet()
    .then(function (wallet) {
      return {
        BTC: wallet.spendableBalance()
      }
    })
    .nodeify(callback)
}

exports.newAddress = function newAddress (info, callback) {
  var address
  var wallet

  return getWallet()
    .then(function (result) {
      wallet = result
      return wallet.createAddress()
    })
    .then(function (result) {
      address = result.address
      // If a label was provided, set the label
      if (info.label) {
        return wallet.setLabel({ address: address, label: info.label })
      }
    })
    .then(function () {
      return address
    })
    .nodeify(callback)
}

function compareTxs (a, b) {
  if (a.instant && b.instant) return 0
  if (a.instant) return -1
  if (b.instant) return 1
  if (!a.pending && !b.pending) return 0
  if (!a.pending) return -1
  if (!b.pending) return 1
  return 0
}

// This new call uses promises. We're in the process of upgrading everything.
exports.getStatus = function getStatus (toAddress, requested) {
  return bitgo.blockchain().getAddressTransactions({address: toAddress})
  .then(function (rec) {
    var txs = rec.transactions
    if (txs.length === 0) return {status: 'notSeen'}

    return getWallet()
    .then(function (wallet) {
      var promises = txs.map(function (tx) {
        return wallet.getTransaction({id: tx.id})
        .then(function (walletTx) {
          return {
            entries: tx.entries,
            instant: walletTx.instant,
            pending: tx.pending
          }
        })
      })

      return Promise.all(promises)
      .then(function (res) {
        var sorted = res.sort(compareTxs)

        var reduction = sorted.reduce(function (acc, tx) {
          if (acc.total.gte(requested)) return acc

          var entry = tx.entries.find(function (_entry) {
            return _entry.account === toAddress
          })

          if (!entry || entry.value <= 0) return acc
          var total = acc.total.plus(entry.value)

          var status = tx.instant
          ? 'instant'
          : tx.pending ? 'authorized' : 'confirmed'

          return ({total: total, status: status})
        }, {total: new BigNumber(0), status: 'notSeen'})

        if (reduction.total.lt(requested)) return {status: 'insufficientFunds'}
        return {status: reduction.status}
      })
    })
  })
}
