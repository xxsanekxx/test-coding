const TYPE_MASKS = {
    'string': 0x73, // 's' = 0x73
    'object': 0x4f, // 'O' = 0x4f
    'i8': 0x2d, // '-' = 0x2d
    'u8': 0x2b, // '+' = 0x2b
    'i16': 0x69, // 'i' = 0x69
    'u16': 0x75, // 'u' = 0x75
    'i32': 0x49, // 'I' = 0x49
    'u32': 0x55, // 'U' = 0x55
    'i64': 0x45, // 'E' = 0x45
    'u64': 0x57, // 'W' = 0x57
    'date': 0x44, // 'D' = 0x44, convert to Date from ms
    'true': 0x54, // 'T' = 0x54
    'false': 0x46, // 'F' = 0x46
    'array': 0x41, // 'A' = 0x41
    'null': 0x4e, // 'N' = 0x4e
    'map': 0x4d, // 'N' = 0x4d
    'set': 0x53, // 'S' = 0x53
    'end': 0x21 // '!' = 0x21, use it for Object, Array, Map, Set
}

type Post1 = {
    id: string;
    text: string;
    createAt: string;
    draft: string;
};

type BufferSchema = {
    id: string;
    age: string,
    testSet: string,
    posts: Post1[]
};


class ValidatorScheme {
    private readonly _scheme: BufferSchema;

    constructor(scheme: BufferSchema) {
        this._scheme = scheme
    }

    private _validateInternalObj(dataValue: any, scheme: string | object | any[], typeOfScheme: string, index: string | number, optional = false) {
        // todo maybe add new class errors, for better description of error (dataValue [object Object])
        const errorType = new Error(`Value in ${dataValue} by ${index} has different type than in scheme`);
        let propertyType = scheme;

        if (typeOfScheme === 'object') {
            if (typeof dataValue !== 'object') {
                throw errorType;
            }

            if (Array.isArray(propertyType)) {
                if (!Array.isArray(dataValue)) {
                    throw errorType;
                }

                return this._validateArray(dataValue, propertyType);
            }

            return this._validateObj(dataValue, propertyType as object);
        }

        if (typeOfScheme === 'string') {
            propertyType = optional ? (propertyType as string).split(':')[1] : propertyType;

            if (propertyType === 'string' && typeof dataValue === 'string') {
                return dataValue;
            }

            if (typeof dataValue === 'number' && (propertyType === 'u8' && dataValue <= 0xFF ||
                propertyType === 'u16' && dataValue <= 0xFFFF ||
                propertyType === 'u32' && dataValue <= 0xFFFFFFFF ||
                propertyType === 'u64' && dataValue <= 0xFFFFFFFFFFFFFFFF)) {
                return dataValue;
            }

            if (propertyType === 'date' && (Object.prototype.toString.call(dataValue) === "[object Date]" && !isNaN(dataValue))) {
                return dataValue;
            }

            if (propertyType === 'bool' && typeof dataValue === 'boolean') {
                return dataValue;
            }

            if (propertyType === 'set' && dataValue instanceof Set) {
                return dataValue;
            }

            if (propertyType === 'map' && dataValue instanceof Map) {
                return dataValue;
            }
        }

        throw errorType;
    }

    private _validateArray(data: any[], scheme: any[]): any[] {
        const dataLength = data.length;
        const schemeLength = scheme.length;

        if (dataLength === 0) {
            return data;
        }

        if (schemeLength === 0) {
            throw new Error('Arrays can\'t be empty in schemes');
        }

        // take only first element, and all elements in array must has same type
        const propertyType: string | object | any[] = scheme[0];
        const typeOfPropertyType = typeof propertyType;

        for (let i = 0; i < dataLength; i++) {
            data[i] = this._validateInternalObj(data[i], propertyType, typeOfPropertyType, i);
        }

        return data;
    }

    // todo because it use recursion, maybe we need set up max depth, or optimize to loops
    private _validateObj(data: object, scheme: object) {
        const tempObj: { [id: string]: unknown } = {};

        for (const key in scheme) {
            if (scheme.hasOwnProperty(key)) {
                let propertyType: string | object | any[] = scheme[key as keyof typeof scheme];
                const typeOfPropertyType = typeof propertyType;
                const optional = typeOfPropertyType === 'string' ? this.isOptional(propertyType as string) : false;

                if (key in data) {
                    const dataValue = data[key as keyof typeof scheme];
                    tempObj[key] = this._validateInternalObj(dataValue, propertyType, typeOfPropertyType, key, optional);
                } else if (!optional) {
                    throw new Error(`Key ${key} is required in data`);
                }
            }
        }

        return tempObj;
    }

    isOptional(str: string):boolean {
        return str.includes('optional');
    }

    validate(data: any) {
        // implement for object for now, maybe add for array and etc
        if (typeof data === 'object' && !Array.isArray(data) && data !== null) {
            return this._validateObj(data as object, this._scheme);
        }

        throw new Error('Data has different type than buffer scheme');
    }
}

class BufferSerializer {
    private _bufferRequiredScheme: any;
    private readonly _requiredTypeOfData: any;
    private _bufferList: Buffer[];
    private _validator: ValidatorScheme;
    private _bufferReaderOffset: number;

    constructor(scheme: BufferSchema) {
        // if (scheme === undefined || scheme === null) {
        //     throw new Error('Scheme for BufferSerializer must be set');
        // }

        this._bufferRequiredScheme = scheme;
        this._requiredTypeOfData = typeof scheme;
        this._bufferList = [];
        this._validator = new ValidatorScheme(scheme);
        this._bufferReaderOffset = 0;
    }

    toBuffer(data: object): Buffer {
        const validData = this._validator.validate(data);

        // start buffer list from zero byte
        this._bufferList.push(Buffer.alloc(1));

        this.toBufferInternal(validData);

        const resultBuff: Buffer = Buffer.concat(this._bufferList);
        this._bufferList = [];

        return resultBuff;
    }

    toBufferInternal(data: any) {
        const type = typeof data;

        if (type === 'object') {
            if (data === null) {
                this.toBufferNull();
                return;
            }

            if (Array.isArray(data)) {
                this.toBufferArray(data);
                return;
            }

            if (Object.prototype.toString.call(data) === "[object Date]" && !isNaN(data)) {
                this.toBufferDate(data);
                return;
            }

            if (data instanceof Map) {
                this.toBufferMap(data as Map<any, any>);
                return;
            }

            if (data instanceof Set) {
                this.toBufferSet(data as Set<any>);
                return;
            }

            this.toBufferObject(data);
        } else if (type === 'string') {
            this.toBufferString(data);
        } else if (type === 'number') {
            this.toBufferNumber(data);
        } else if (type === 'boolean') {
            this.toBufferBoolean(data);
        }
    }

    _writeBufferStringSize(size: number) {
        if (size < 0) {
            throw new Error('Size of buffer must be positive!');
        }

        // store size by LZ77 algorithm

        // check if size not high than 8 bit number
        if (size < 0x7F) {
            const buff = Buffer.alloc(1);
            buff.writeUInt8(size);
            this._bufferList.push(buff);
            return;
        }

        // check if size not high than 16 bit number
        if (size < 0x3FFF) {
            const buff = Buffer.alloc(2);
            buff.writeUInt16BE(size | 0x8000);
            this._bufferList.push(buff);
            return;
        }

        // check if size not high than 32 bit number
        if (size < 0x1FFFFFFF) {
            const buff = Buffer.alloc(4);
            buff.writeUint32BE(size + 0xC0000000);
            this._bufferList.push(buff);
            return;
        }

        throw new Error(`Size of buffer is too large: ${size}`);
    }

    toBufferObject(data: any) {
        this._bufferList.push(Buffer.alloc(1, TYPE_MASKS.object));

        for (const key in data) {
            // todo if key is number as string we convert it to number for optimization
            // we parse it only like a data, without inherited properties or else
            if (data.hasOwnProperty(key) && data[key] !== undefined) {
                this.toBufferInternal(key);
                this.toBufferInternal(data[key]);
            }
        }

        this._bufferList.push(Buffer.alloc(1, TYPE_MASKS.end));
    }

    toBufferString(str: string) {
        this._bufferList.push(Buffer.alloc(1, TYPE_MASKS.string));
        this._writeBufferStringSize(str.length);
        this._bufferList.push(Buffer.from(str));
    }

    toBufferNumber(num: number | bigint) {
        // todo check is integer/double

        let buff;
        const isNegative = num < 0;
        let absNum = isNegative ? -num : num;

        // u8
        if (absNum <= 0xFF) {
            this._bufferList.push(Buffer.alloc(1, isNegative ? TYPE_MASKS.i8 : TYPE_MASKS.u8));
            buff = Buffer.alloc(1);
            buff.writeUInt8(absNum as number);
        } else if (absNum <= 0xFFFF) { // u16
            this._bufferList.push(Buffer.alloc(1, isNegative ? TYPE_MASKS.i16 : TYPE_MASKS.u16));
            buff = Buffer.alloc(2);
            buff.writeUInt16BE(absNum as number);
        } else if (absNum <= 0xFFFFFFFF) { // u32
            this._bufferList.push(Buffer.alloc(1, isNegative ? TYPE_MASKS.i32 : TYPE_MASKS.u32));
            buff = Buffer.alloc(4);
            buff.writeUInt32BE(absNum as number);
        } else if (absNum <= 0xFFFFFFFFFFFFFFFF) { // u64
            this._bufferList.push(Buffer.alloc(1, isNegative ? TYPE_MASKS.i64 : TYPE_MASKS.u64));
            buff = Buffer.alloc(8);
            buff.writeBigUInt64BE(BigInt(absNum));
        }

        if (buff) {
            this._bufferList.push(buff);
        }

    }

    toBufferBoolean(bool: boolean) {
        if (bool) {
            this._bufferList.push(Buffer.alloc(1, TYPE_MASKS.true));
        } else {
            this._bufferList.push(Buffer.alloc(1, TYPE_MASKS.false));
        }
    }

    toBufferArray(arr: any[]) {
        this._bufferList.push(Buffer.alloc(1, TYPE_MASKS.array));
        const arrLength = arr.length;

        if (arrLength) {
            for (const arrValue of arr) {
                if (arrValue !== undefined) {
                    this.toBufferInternal(arrValue);
                }
            }
        }

        this._bufferList.push(Buffer.alloc(1, TYPE_MASKS.end));
    }

    toBufferNull() {
        this._bufferList.push(Buffer.alloc(1, TYPE_MASKS.null));
    }

    toBufferDate(data: Date) {
        // need to remember max/min ms date between ±8,640,000,000,000,000 milliseconds it less than Number.MAX_SAFE_INTEGER
        // but we need add uint64 for number bigger than 4,294,967,295 (uint32)
        // and signed int for negative numbers or we can add special chars ('-', '+', etc) and use only uint
        const ms = data.getTime();
        this._bufferList.push(Buffer.alloc(1, TYPE_MASKS.date));
        this.toBufferNumber(ms);
    }

    toBufferMap(data: Map<unknown, unknown>) {
        this._bufferList.push(Buffer.alloc(1, TYPE_MASKS.map));

        data.forEach((value, key) => {
            if (value !== undefined) {
                this.toBufferInternal(key);
                this.toBufferInternal(value);
            }
        });

        this._bufferList.push(Buffer.alloc(1, TYPE_MASKS.end));
    }

    toBufferSet(data: Set<any>) {
        this._bufferList.push(Buffer.alloc(1, TYPE_MASKS.set));

        data.forEach((value) => {
            if (value !== undefined) {
                this.toBufferInternal(value);
            }
        })

        this._bufferList.push(Buffer.alloc(1, TYPE_MASKS.end));
    }

    _readBufferStringSize(buff: Buffer) {
        if (!(buff[this._bufferReaderOffset] & 0x80)) {
            const result = buff.readUInt8(this._bufferReaderOffset);
            this._bufferReaderOffset += 1;
            return result;
        }

        if (!(buff[this._bufferReaderOffset] & 0x40)) {
            const result = buff.readUInt16BE(this._bufferReaderOffset) & 0x3FFF;
            this._bufferReaderOffset += 2;
            return result;
        }

        if (!(buff[this._bufferReaderOffset] & 0x20)) {
            const result = buff.readUInt32BE(this._bufferReaderOffset) & 0x1FFFFFFF;
            this._bufferReaderOffset += 4;
            return result;
        }

        throw new Error(`Size of buffer string is invalid: ${buff[this._bufferReaderOffset]}`);
    }

    fromBuffer(buff: Buffer): any {
        if (buff[this._bufferReaderOffset] !== 0x00) {
            throw new Error('Invalid buffer it must start from zero');
        }

        this._bufferReaderOffset += 1;

        return this.fromBufferInternal(buffer);
    }

    fromBufferInternal(buff: Buffer): any {
        const code = buff.readUInt8(this._bufferReaderOffset);

        this._bufferReaderOffset += 1;

        switch (code) {
            case TYPE_MASKS.i8:
            case TYPE_MASKS.u8:
            case TYPE_MASKS.i16:
            case TYPE_MASKS.u16:
            case TYPE_MASKS.u32:
            case TYPE_MASKS.i32:
            case TYPE_MASKS.u64:
            case TYPE_MASKS.i64:
                return this.fromBufferNumber(buff, code);
            case TYPE_MASKS.array:
                return this.fromBufferArray(buff);
            case TYPE_MASKS.object:
                return this.fromBufferObject(buff);
            case TYPE_MASKS.string:
                return this.fromBufferString(buff);
            case TYPE_MASKS.date:
                return this.fromBufferDate(buff);
            case TYPE_MASKS.map:
                return this.fromBufferMap(buff);
            case TYPE_MASKS.set:
                return this.fromBufferSet(buff);
            case TYPE_MASKS.null:
                return null;
            case TYPE_MASKS.true:
                return true;
            case TYPE_MASKS.false:
                return false;
            default: throw new Error(`Can't encode buffer, unknown type code: ${code}`);
        }
    }

    fromBufferArray(buff: Buffer) {
        const resultArr = [];
        let buffChunk = buff[this._bufferReaderOffset];

        while (buffChunk !== TYPE_MASKS.end) {
            resultArr.push(this.fromBufferInternal(buff));
            buffChunk = buff[this._bufferReaderOffset];
        }

        this._bufferReaderOffset += 1;
        return resultArr;
    }

    fromBufferObject(buff: Buffer): object {
        const resultObj: { [key: string]: any } = {};
        let buffChunk = buff[this._bufferReaderOffset];

        while(buffChunk !== TYPE_MASKS.end) {
            const key = (this.fromBufferInternal(buff) as string);
            resultObj[key] = this.fromBufferInternal(buff);
            buffChunk = buff[this._bufferReaderOffset];
        }

        this._bufferReaderOffset += 1;

        return resultObj;
    }

    fromBufferDate(buff: Buffer) {
        const date = new Date();
        const ms = this.fromBufferInternal(buff);

        if (ms > Number.MAX_SAFE_INTEGER || ms < Number.MIN_SAFE_INTEGER) {
            throw new Error(`Can't decode date, invalid date number ${ms}`);
        }

        date.setTime(Number(ms));
        return date;
    }

    fromBufferString(buff: Buffer) {
        let size = this._readBufferStringSize(buff);
        const result = buff.slice(this._bufferReaderOffset, this._bufferReaderOffset + size);
        this._bufferReaderOffset += size;

        return result.toString('binary');
    }

    fromBufferNumber(buff: Buffer, code: number): number | BigInt {
        let num;

        switch (code) {
            case TYPE_MASKS.i8:
                num = buff.readInt8(this._bufferReaderOffset);
                this._bufferReaderOffset += 1;
                return num;
            case TYPE_MASKS.u8:
                num = buff.readUInt8(this._bufferReaderOffset);
                this._bufferReaderOffset += 1;
                return num;
            case TYPE_MASKS.i16:
                num = buff.readInt16BE(this._bufferReaderOffset);
                this._bufferReaderOffset += 2;
                return num;
            case TYPE_MASKS.u16:
                num = buff.readUint16BE(this._bufferReaderOffset);
                this._bufferReaderOffset += 2;
                return num;
            case TYPE_MASKS.i32:
                num = buff.readInt32BE(this._bufferReaderOffset);
                this._bufferReaderOffset += 4;
                return num;
            case TYPE_MASKS.u32:
                num = buff.readUInt32BE(this._bufferReaderOffset);
                this._bufferReaderOffset += 4;
                return num;
            case TYPE_MASKS.i64:
                num = buff.readBigInt64BE(this._bufferReaderOffset);
                this._bufferReaderOffset += 8;
                return num;
            case TYPE_MASKS.u64:
                num = buff.readBigUInt64BE(this._bufferReaderOffset);
                this._bufferReaderOffset += 8;
                return num;
            default: throw new Error(`Can't encode buffer number, unknown type code: ${code}`);
        }
    }

    fromBufferMap(buff: Buffer) {
        const resultMap = new Map();

        let buffChunk = buff[this._bufferReaderOffset];

        while(buffChunk !== TYPE_MASKS.end) {
            const key = (this.fromBufferInternal(buff) as string);
            resultMap.set(key, this.fromBufferInternal(buff));
            buffChunk = buff[this._bufferReaderOffset];
        }

        this._bufferReaderOffset += 1;

        return resultMap;

    }

    fromBufferSet(buff: Buffer) {
        const resultSet = new Set();
        let buffChunk = buff[this._bufferReaderOffset];

        while (buffChunk !== TYPE_MASKS.end) {
            resultSet.add(this.fromBufferInternal(buff));
            buffChunk = buff[this._bufferReaderOffset];
        }

        this._bufferReaderOffset += 1;
        return resultSet;
    }
}

const userSchema: BufferSchema = {
    id: 'string',
    age: 'u32',
    testSet: 'optional:map',
    posts: [{
        id: 'string',
        text: 'string',
        createAt: 'date',
        draft: 'bool'
    }]
}

const serializer = new BufferSerializer(userSchema);

const test = new Map();
test.set('one', 'map test');
const buffer = serializer.toBuffer({
    id: 'u1',
    age: 30,
    testSet: test,
    posts: [
        {
            id: 'p1',
            text: 'post1',
            createAt: new Date(),
            draft: true
        },
        {
            id: 'p2',
            text: 'post2',
            createAt: new Date(),
            draft: false
        },
    ]
});

console.log(buffer);

const user = serializer.fromBuffer(buffer);

console.log(user);