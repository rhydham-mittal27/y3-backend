const express = require('express');
const app = require('./src/server').default;

function print(path, layer) {
    if (layer.route) {
        layer.route.stack.forEach(print.bind(null, path + (layer.route.path || '')))
    } else if (layer.name === 'router' && layer.handle.stack) {
        layer.handle.stack.forEach(print.bind(null, path + (layer.regexp.source.replace('\\/?', '').replace('(?=\\/|$)', '').replace('^', ''))))
    } else if (layer.method) {
        console.log('%s /api%s', layer.method.toUpperCase(), path.replace(/\\\//g, '/').replace(/\/\//g, '/'))
    }
}

app._router.stack.forEach(print.bind(null, ''))
