import { useState } from "react";

export default function StartForm({ onStart }: { onStart: (p: { firstName: string; age: number; sex: string }) => void }) {
  const [firstName, setFirstName] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("");
  const valid = firstName.trim() && Number(age) > 0 && Number(age) < 130 && sex;
  const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 focus:border-teal-500 focus:outline-none";
  return (
    <form
      className="mx-auto mt-10 w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-6"
      onSubmit={(e) => { e.preventDefault(); if (valid) onStart({ firstName: firstName.trim(), age: Number(age), sex }); }}
    >
      <div>
        <h1 className="text-xl font-bold">Pre-visit intake</h1>
        <p className="mt-1 text-sm text-slate-500">Alice will ask a few questions so your doctor is prepared. This is a demo, so please don't enter real personal health information.</p>
      </div>
      <label className="block text-sm font-medium">First name
        <input className={field} value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={50} autoFocus />
      </label>
      <label className="block text-sm font-medium">Age
        <input className={field} value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={3} />
      </label>
      <label className="block text-sm font-medium">Sex
        <select className={field} value={sex} onChange={(e) => setSex(e.target.value)}>
          <option value="">Select…</option>
          <option value="female">Female</option>
          <option value="male">Male</option>
          <option value="other">Other / prefer not to say</option>
        </select>
      </label>
      <button disabled={!valid} className="w-full rounded-lg bg-teal-600 py-2.5 font-semibold text-white disabled:opacity-40">
        Start interview
      </button>
    </form>
  );
}
