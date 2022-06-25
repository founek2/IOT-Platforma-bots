import { PropertyClass, PropertyDataType, ComponentType, DeviceCommand } from './type';
import * as mqtt from 'mqtt';
import { Node, PropertyArgs } from './node';
import conf from '../config';
import { EventEmitter } from 'events';
import { localStorage } from './storage';

export enum DeviceStatus {
    disconnected = 'disconnected',
    lost = 'lost',
    error = 'error',
    alert = 'alert',
    sleeping = 'sleeping',
    restarting = 'restarting',
    ready = 'ready',
    init = 'init',
    paired = 'paired',
}

function logger(...args: any) {
    if (process.env.MODE != 'test') console.log(...args);
}
interface store {
    apiKey: string;
}

export class Platform extends EventEmitter {
    deviceId: string;
    deviceName: string;
    meta: null | store = null;
    userName: string;
    client: mqtt.MqttClient;
    prefix = 'prefix';
    nodes: Node[] = [];
    sensorCnt = -1;
    status: DeviceStatus = DeviceStatus.lost;

    constructor(deviceId: string, userName: string, deviceName: string) {
        super();
        this.deviceId = process.env.DEVICE_ID || deviceId;
        this.userName = process.env.USERNAME || userName;
        this.deviceName = deviceName;

        const storedItem = localStorage.getItem(this.deviceId);
        if (storedItem) this.meta = JSON.parse(storedItem);
    }

    init = async () => {
        if (!this.isPaired()) return this.connectPairing();
        return this.connect();
    };

    isPaired = () => {
        return this.meta;
    };

    forgot = () => {
        this.meta = null;
        this.prefix = 'prefix';
        localStorage.removeItem(this.deviceId);
    };

    connect = () => {
        if (this.meta === null) {
            logger('cant connect without apiKey');
            return;
        }

        this.prefix = `v2/${this.userName}`;

        this.client = mqtt.connect(conf.MQTT_SERVER_URL, {
            username: 'device=' + this.userName + '/' + this.deviceId,
            password: this.meta.apiKey,
            port: conf.MQTT_SERVER_PORT,
            connectTimeout: 20 * 1000,
            rejectUnauthorized: false,
            will: {
                topic: 'v2/' + this.userName + '/' + this.deviceId + '/$state',
                payload: DeviceStatus.lost,
                retain: true,
                qos: 1,
            },
        });
        const client = this.client;

        logger('connecting as paired device');
        // client.subscribe("v2/device/" + this.deviceId + "/apiKey");
        client.subscribe(`${this.getDevicePrefix()}/$cmd/set`);

        // setInterval(() => )
        this.setStatus(DeviceStatus.ready);

        this.nodes.forEach(({ nodeId, properties }) => {
            properties.forEach(({ propertyId, settable }) => {
                if (settable) client.subscribe(`${this.getDevicePrefix()}/${nodeId}/${propertyId}/set`);
            });
        });

        client.on('message', (topic, data) => {
            const message = data.toString();
            logger('message', topic, message);
            if (topic === `${this.getDevicePrefix()}/$cmd/set`) {
                if (message === DeviceCommand.restart) {
                    logger('Reseting...');
                    client.end();
                    this.connect();
                } else if (message === DeviceCommand.reset) {
                    logger('Restarting...');
                    client.end();
                    this.forgot();
                    this.connectPairing();
                }
            } else if (topic.startsWith(this.getDevicePrefix())) {
                this.nodes.forEach(({ nodeId, properties }) => {
                    properties.forEach((property) => {
                        const { propertyId, settable, callback } = property;
                        if (`${this.getDevicePrefix()}/${nodeId}/${propertyId}/set` === topic && settable) {
                            property.value = message;
                            if (callback) callback(property);
                            client.publish(`${this.getDevicePrefix()}/${nodeId}/${propertyId}`, message);
                        }
                    });
                });
            } else this.emit(topic.replace(this.getDevicePrefix(), ''), message);
        });
        client.on('error', (err: any) => {
            if (err.code === 4) {
                // Invalid login
                logger('Invalid userName/password, forgeting apiKey');

                if (process.env.NODE_ENV !== 'production') {
                    client.end();
                    this.forgot();
                    this.connectPairing();
                }
            } else logger('error2', err);
        });
        client.on('connect', () => {
            this.emit('connect', client);
        });
    };

    addNode = (nodeId: string, name: string, componentType: ComponentType) => {
        const node = new Node({ nodeId, name, componentType });
        this.nodes.push(node);
        return node;
    };

    addSensor = (args: PropertyArgs) => {
        const node = this.addNode('sensor' + ++this.sensorCnt, args.name, ComponentType.sensor);
        node.addProperty(args);
    };

    setStatus = (status: DeviceStatus) => {
        if (this.status !== status) {
            this.status = status;

            if (this.client) this.client.publish(`${this.getDevicePrefix()}/$state`, status);
        }
    };

    getDevicePrefix = () => `${this.prefix}/${this.deviceId}`;

    connectPairing = async () => {
        this.client = mqtt.connect(conf.MQTT_SERVER_URL, {
            username: 'guest=' + this.deviceId,
            password: this.userName,
            port: conf.MQTT_SERVER_PORT,
            connectTimeout: 20 * 1000,
            rejectUnauthorized: false,
            will: {
                topic: `${this.getDevicePrefix()}/$state`,
                payload: DeviceStatus.lost,
                retain: true,
                qos: 1,
            },
        });
        const client = this.client;

        client.on('error', function (err) {
            logger('error', err);
        });

        client.on('connect', () => {});

        logger('connecting as guest to', conf.MQTT_SERVER_URL);
        this.setStatus(DeviceStatus.init);
        client.subscribe(`${this.getDevicePrefix()}/$config/apiKey/set`);
        client.subscribe(`${this.getDevicePrefix()}/$cmd/set`);

        client.publish(`${this.getDevicePrefix()}/$name`, this.deviceName);
        client.publish(`${this.getDevicePrefix()}/$realm`, this.userName);
        client.publish(`${this.getDevicePrefix()}/$nodes`, this.nodes.map((node) => node.nodeId).join());

        this.nodes.forEach(({ nodeId, properties, componentType, name }) => {
            client.publish(`${this.getDevicePrefix()}/${nodeId}/$name`, name);
            client.publish(`${this.getDevicePrefix()}/${nodeId}/$type`, componentType);
            client.publish(
                `${this.getDevicePrefix()}/${nodeId}/$properties`,
                properties.map((prop) => prop.propertyId).join()
            );
            properties.forEach(
                ({ name, propertyClass, unitOfMeasurement, propertyId, dataType, format, settable, retained }) => {
                    if (name) client.publish(`${this.getDevicePrefix()}/${nodeId}/${propertyId}/$name`, name);
                    if (unitOfMeasurement)
                        client.publish(`${this.getDevicePrefix()}/${nodeId}/${propertyId}/$unit`, unitOfMeasurement);
                    if (dataType)
                        client.publish(`${this.getDevicePrefix()}/${nodeId}/${propertyId}/$datatype`, dataType);
                    if (propertyClass)
                        client.publish(`${this.getDevicePrefix()}/${nodeId}/${propertyId}/$class`, propertyClass);
                    if (format) client.publish(`${this.getDevicePrefix()}/${nodeId}/${propertyId}/$format`, format);
                    if (settable)
                        client.publish(
                            `${this.getDevicePrefix()}/${nodeId}/${propertyId}/$settable`,
                            settable.toString()
                        );

                    if (retained)
                        client.publish(
                            `${this.getDevicePrefix()}/${nodeId}/${propertyId}/$retained`,
                            retained.toString()
                        );
                }
            );
        });
        logger('meta', this.meta);

        client.on('message', async (topic, message) => {
            logger('message', topic, message.toString());

            if (this.getDevicePrefix() + '/$config/apiKey/set') {
                this.meta = { apiKey: message.toString() };
                localStorage.setItem(this.deviceId, JSON.stringify(this.meta));
                logger('GOT apiKey -> reconect');

                this.setStatus(DeviceStatus.paired);
                this.setStatus(DeviceStatus.disconnected);
                client.end();
                this.connect();
            }
        });
        this.setStatus(DeviceStatus.ready);
    };

    publishSensorData = (propertyId: string, value: string | Buffer) => {
        const node = this.nodes.find(
            ({ properties, componentType }) =>
                properties.some((prop) => prop.propertyId === propertyId) && componentType === ComponentType.sensor
        );
        if (!node) return logger('unable to locate sensor node');
        if (!this.client) return logger('Not connected');

        this.client.publish(`${this.getDevicePrefix()}/${node.nodeId}/${propertyId}`, value);
    };
    publishData = (nodeId: string, propertyId: string, value: string) => {
        if (!this.client) return logger('Not connected');

        this.client.publish(`${this.getDevicePrefix()}/${nodeId}/${propertyId}`, value);
    };
}

function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
