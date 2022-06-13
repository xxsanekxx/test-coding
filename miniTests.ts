type Post = {
    id: string;
    text: string;
    user: User;
}

type User = {
    id: string;
    name: string;
    posts: Post[];
}

type IntersectionFields = 'posts' | 'user' ;
type Select<TObj extends object> = {
    [TKey in keyof TObj]:
    TObj[TKey] extends object[] ? Select<Omit<TObj[TKey][0], IntersectionFields>> :
        TObj[TKey] extends object ? Select<Omit<TObj[TKey], IntersectionFields>> : boolean;
};

const userSelect: Select<User> = {
    id: true,
    name: true,
    posts: {
        id: true,
        text: true
    }
};

const postSelect: Select<Post> = {
    id: true,
    text: true,
    user: {
        id: true,
        name: true
    }
};

// ---------- END 1

const task = async function<T>(value: T) {
    await new Promise((r) => setTimeout(r, 100 * Math.random()));
    console.log(value);
};

// Promise.all([
//     task(1),
//     task(2),
//     task(3),
//     task(4),
// ]).then(() => { console.log('Done') });

class AsyncQueue {
    private _promises: Promise<void>[];

    constructor() {
        this._promises = [];
    }

    add(callbackTask: () => Promise<void>): Promise<void> {
        return new Promise((mainResolver) => {
            if (!this._promises.length) {
                this._promises.push(new Promise(r => {
                    callbackTask().then(() => { r(); });
                }));
                mainResolver();
            } else {
                const prevPromise = this._promises.shift() as Promise<void>;


                this._promises.push(new Promise(r => {
                    prevPromise.then(() => {
                        callbackTask().then(() => {
                            r();
                            mainResolver();
                        });
                    });
                }));
            }
        });
    }
}

const queue = new AsyncQueue();

Promise.all([
    queue.add(() => task(1)),
    queue.add(() => task(2)),
    queue.add(() => task(3)),
    queue.add(() => task(4)),
]).then(() => {
    console.log('done!!');
});

// ------ End 2
