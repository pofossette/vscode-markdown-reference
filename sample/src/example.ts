export interface User {
    id: string;
    name: string;
    email: string;
}

const users: User[] = [];

export function addUser(user: User): void {
    users.push(user);
}

export function findUser(id: string): User | undefined {
    return users.find(user => user.id === id);
}

export function displayName(user: User): string {
    return `${user.name} <${user.email}>`;
}

export function userCount(): number {
    return users.length;
}

export function clearUsers(): void {
    users.length = 0;
}
