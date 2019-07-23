const { STATUS, STATUS_MSG } = require('./util/status');

module.exports = RED => {
	RED.nodes.registerType('Digital OUT', function (config) {
		const topic = config.name || 'Digital OUT';
		const portinfoType = '3';
		const portinfoType2 = '5';

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
			let clampLabels = [];

			sendWebioStatus(STATUS_MSG[STATUS.NOT_INITIALIZED]);

			webio.emitter.addListener('webioLabels', labels => {
				clampLabels = labels[portinfoType] || labels[portinfoType2] || {};
				isValidClamp = !!clampLabels[config.number];
				if (value !== undefined) {
					this.send({ topic: topic, payload: value, clampName: clampLabels[config.number] || config.number });
				}
			});

			webio.emitter.addListener('webioGet', (type, mask, status) => {
				if (type === 'output') {
					let tmpValue = null;

					if (status === STATUS.OK && isValidClamp) {
						tmpValue = ((mask >> config.number) & 1) === 1;
						sendWebioStatus({ fill: 'green', shape: 'dot', text: tmpValue ? 'status.connectedON' : 'status.connectedOFF' });
					} else {
						sendWebioStatus(STATUS_MSG[status] || STATUS_MSG[STATUS.UNKNOWN]);
					}

					if (tmpValue !== value) {
						value = tmpValue;
						this.send({ topic: topic, payload: value, clampName: clampLabels[config.number] || config.number });
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
				if (webio && webio.emitter && typeof msg.payload === 'boolean') {
					webio.emitter.emit('webioSet', 'digitalout', config.number, msg.payload);
				} else {
					this.warn(RED._('@wiesemann-theis/node-red-contrib-wut/web-io:logging.input-failed'));
				}
			} else {
				this.warn(RED._('@wiesemann-theis/node-red-contrib-wut/web-io:logging.input-invalid-clamp', { index: config.number }));
			}
		});
	});
}