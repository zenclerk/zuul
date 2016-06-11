var bouncy = require('bouncy');
var debug = require('debug')('zuul:setup');

var user_server = require('./user-server');

// Ref: https://wiki.saucelabs.com/display/DOCS/Sauce+Connect+FAQS#SauceConnectFAQS-CanIAccessApplicationsonlocalhost?
var sauce_connect_fiendly_ports = [8081, 8765, 8777, 8888, 9000, 9001, 9080, 9090, 9876, 9877, 9999, 49221, 55001];

// sets up a test instance
// cb(err, instance)
// instance.shutdown() terminates the instance
function setup_test_instance(opt, _cb) {
    var cb = function() {
      var slice = [].slice;
      var args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
      console.log("waiting solve everything...");
      setTimeout(function() {
        return _cb.apply(null, args);
      }, 10000);
    }

    var support_server = undefined;
    var bouncer = undefined;
    var Tunnel;
    if (typeof opt.tunnel === 'string') {
        Tunnel = require('zuul-' + opt.tunnel);
        debug('using zuul-%s to tunnel', opt.tunnel);
    } else if (typeof opt.tunnel === 'object' && opt.tunnel.type) {
        Tunnel = require('zuul-' + opt.tunnel.type);
        debug('using zuul-%s to tunnel', opt.tunnel.type);
    } else {
        Tunnel = require('zuul-localtunnel');
        debug('using zuul-localhost to tunnel');
    }

    var tunnel = new Tunnel(opt);

    if (opt.server) {
        user_server(opt.server, setup);
    }
    else {
        setup();
    }

    function setup(_support_server) {
        support_server = _support_server;
        var config = opt;
        var control_port = opt.control_port;

        var support_port = undefined;
        if (support_server) {
            support_port = config.support_port = support_server.port;
        }

        // TODO start support server
        // currently happens within user_server

        var bouncer_port = 0;
        if (config.local && parseInt(config.local)) {
            bouncer_port = config.local;
        }

        if (config.phantom && parseInt(config.phantom)) {
            bouncer_port = config.phantom;
        }
        if (config.sauce_connect) {
          var sauce_connect_port = sauce_connect_fiendly_ports.pop();
          if (!sauce_connect_port) {
            console.log("no available sauce connect friendly port");
            process.exit(23)
          }
          console.log("HACK bouncer port(" + bouncer_port + ") is overriden with " + sauce_connect_port);
          bouncer_port = sauce_connect_port
        }

        bouncer = bouncy(function (req, res, bounce) {
            var url = req.url.split('?')[0];
            if (!support_port || url.split('/')[1] === '__zuul') {
                bounce(control_port, { headers: { connection: 'close' }});
                return;
            }

            var opts = {};
            if (req.headers.connection && req.headers.connection.toLowerCase().indexOf('upgrade') === -1) {
                opts.headers = { connection: 'close' };
            }
            bounce(support_port, opts);
        });

        bouncer.listen(bouncer_port, bouncer_active);

        function bouncer_active() {
            var app_port = bouncer.address().port;
            debug('bouncer active on port %d', app_port);

            if (!config.tunnel) {
                return cb(null, 'http://localhost:' + app_port + '/__zuul');
            }

            tunnel.connect(app_port, cb);
        };
    }

    function shutdown() {
        bouncer.close();
        tunnel.close();

        if (support_server) {
            support_server.process.kill('SIGTERM');
        }
    }

    return {
        shutdown: shutdown
    };
}

module.exports = setup_test_instance;
