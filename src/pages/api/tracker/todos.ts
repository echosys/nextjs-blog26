import type { NextApiRequest, NextApiResponse } from 'next';
import { createTodo, deleteTodo, listTodos, updateTodo, type TodoPatch } from '../../../lib/tracker/storage';
import { isDateKey, sanitizeTodoInput, TrackerInputError } from '../../../lib/tracker/model';
import { queryString, sendTrackerError } from '../../../lib/tracker/api';

function parsePatch(body: any): TodoPatch {
    const patch: TodoPatch = {};
    if (typeof body?.done === 'boolean') {
        patch.done = body.done;
        if (body.done) {
            if (!isDateKey(body.doneDate)) throw new TrackerInputError('doneDate must be YYYY-MM-DD');
            patch.doneDate = body.doneDate;
        }
    }
    if (body?.tier === 1 || body?.tier === 2) patch.tier = body.tier;
    if (body?.kind === 'regular' || body?.kind === 'longterm') patch.kind = body.kind;
    if (body?.revive === true) patch.revive = true;
    return patch;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const host = req.headers.host;
    try {
        if (req.method === 'GET') return res.status(200).json(await listTodos(host));
        if (req.method === 'POST') return res.status(201).json(await createTodo(host, sanitizeTodoInput(req.body)));

        const id = queryString(req.query.id) ?? (typeof req.body?.id === 'string' ? req.body.id : undefined);
        if (!id) return res.status(400).json({ error: 'id required' });

        if (req.method === 'PATCH') {
            await updateTodo(host, id, parsePatch(req.body));
            return res.status(200).json({ success: true });
        }
        if (req.method === 'DELETE') {
            await deleteTodo(host, id);
            return res.status(200).json({ success: true });
        }
        res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    } catch (error) {
        return sendTrackerError(res, error);
    }
}
