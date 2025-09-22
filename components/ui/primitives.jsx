// components/ui/primitives.jsx
export const Card = ({children, className=""}) => (
  <div className={`card ${className}`}>{children}</div>
);
export const CardHeader = ({children}) => <div className="card__head">{children}</div>;
export const CardContent = ({children}) => <div className="card__body">{children}</div>;

export const Button = ({children, className="", ...props}) => (
  <button className={`btn ${className}`} {...props}>{children}</button>
);
export const PrimaryButton = (p)=> <Button className={"btn--primary "+(p.className||"")} {...p}/>;
export const DangerButton = (p)=> <Button className={"btn--danger "+(p.className||"")} {...p}/>;

export const Label = ({children, className=""}) => <label className={`label ${className}`}>{children}</label>;
export const Input = (p)=> <input className={"input "+(p.className||"")} {...p}/>;
export const Select = ({children, className="", ...props}) => <select className={"select "+className} {...props}>{children}</select>;
export const Textarea = (p)=> <textarea className={"textarea "+(p.className||"")} {...p}/>;
