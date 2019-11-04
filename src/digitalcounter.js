const { STATUS, STATUS_MSG } = require('./util/status');

module.exports = RED => {
	RED.nodes.registerType('Counter', function (config) {
		const topic = config.topic || config.name || 'Counter';
		const portinfoType = '4';

		RED.nodes.createNode(this, config);

		let lastStatusString = '';
		const sendWebioStatus = (status) => {
			if (JSON.stringify(status) !== lastStatusString) {
				lastStatusString = JSON.stringify(status);
				RED.comms.publish('wut/webio-i18n-status/' + this.id, status, true);
			}
		}

		let isValidClamp = true;
		const webio = RED.nodes.getNode(config.webio);
		if (webio && webio.emitter) {
			let value;
			let lastValue = null;
			let unit = '';
			let diff = null;
			let clampLabels = [];

			sendWebioStatus(STATUS_MSG[STATUS.NOT_INITIALIZED]);

			webio.emitter.addListener('webioLabels', labels => {
				clampLabels = labels[portinfoType] || {};
				isValidClamp = !!clampLabels[config.number];
				if (value !== undefined) {
					this.send({ topic, payload: value, unit, diff, clampName: clampLabels[config.number] || config.number });
				}
			});

			webio.emitter.addListener('webioGet', (type, values, status) => {
				if (type === `counter${config.number}`) { // workaround to handle single counter value messages
					const tmp = new Array(config.number + 1);
					tmp[config.number] = values;
					values = tmp;
					type = 'counter';
				}
				if (type === 'counter') {
					let tmpValue = null;

					if (status === STATUS.OK && isValidClamp && values && values[config.number] !== undefined) {
						let match = (values[config.number] || '').match(/^(-?\d+,?\d*).*$/);
						if (match !== null) {
							tmpValue = parseFloat(match[1].replace(',', '.'));
							sendWebioStatus({ fill: 'green', shape: 'dot', text: 'status.connected', params: { value: values[config.number] } });
						} else {
							sendWebioStatus({ fill: 'red', shape: 'dot', text: 'status.no-value' });
						}

						match = (values[config.number] || '').match(/^-?\d+,?\d*\s?(.*)$/);
						unit = match !== null ? match[1] : '';
					} else {
						sendWebioStatus(STATUS_MSG[status] || STATUS_MSG[STATUS.UNKNOWN]);
					}

					if (tmpValue !== value) {
						value = tmpValue;
						if (value !== null && !isNaN(value)) {
							if (lastValue !== null) {
								diff = value - lastValue;
							}
							lastValue = value;
						}
						this.send({ topic, payload: value, unit, diff, clampName: clampLabels[config.number] || config.number });
					}
				} else if (!isValidClamp && status === STATUS.OK) {
					sendWebioStatus(STATUS_MSG[STATUS.OK]);  // invalid clamp status (if invalid web-io configured)
				}
			});
		} else {
			this.warn(RED._('@wiesemann-theis/node-red-contrib-wut/web-io:logging.invalid-webio'));
			sendWebioStatus(STATUS_MSG[STATUS.INVALID_CONFIG]);
		}

		this.on('input', msg => {
			if (isValidClamp) {
				if (typeof msg.payload === 'string') {
					msg.payload = msg.payload.replace(',', '.');
				}
				const value = parseFloat(msg.payload);
				if (webio && webio.emitter && !isNaN(value)) {
					webio.emitter.emit('webioSet', 'digitalcounter', config.number, value);
				} else {
					this.warn(RED._('@wiesemann-theis/node-red-contrib-wut/web-io:logging.input-failed'));
				}
			} else {
				this.warn(RED._('@wiesemann-theis/node-red-contrib-wut/web-io:logging.input-invalid-clamp', { index: config.number }));
			}
		});
	});
}