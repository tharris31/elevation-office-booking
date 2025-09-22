export const Button = ({ className = "", children, ...props }) => (
  <button
    className={"px-3 py-2 rounded-2xl shadow-sm border border-gray-200 hover:shadow transition " + className}
    {...props}
  >
    {children}
  </button>
);

export const Input = ({ className = "", ...props }) => (
  <input
    className={"w-full px-3 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring focus:ring-indigo-200 " + className}
    {...props}
  />
);

export const Select = ({ className = "", children, ...props }) => (
  <select
    className={"w-full px-3 py-2 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring focus:ring-indigo-200 " + className}
    {...props}
  >
    {children}
  </select>
);

export const Label = ({ children, className = "" }) => (
  <label className={"text-sm text-gray-600 " + className}>{children}</label>
);

export const Card = ({ className = "", children }) => (
  <div className={"bg-white rounded-2xl shadow-sm border border-gray-100 " + className}>{children}</div>
);

export const CardHeader = ({ children }) => (
  <div className="p-4 border-b border-gray-100 flex items-center justify-between">{children}</div>
);

export const CardContent = ({ children }) => <div className="p-4">{children}</div>;
