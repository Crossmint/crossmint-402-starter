declare module "@langchain/core/tools" {
  import { z } from "zod";

  export interface ToolInputSchemaBase {
    [key: string]: any;
  }

  export interface StructuredToolInterface<
    T extends ToolInputSchemaBase = ToolInputSchemaBase,
    U = any,
    V = any,
  > {
    name: string;
    description: string;
    schema: any;
    func: (input: T) => Promise<U> | U;

    // LangChain required properties
    lc_serializable?: boolean;
    lc_kwargs?: Record<string, any>;
    lc_namespace?: string[];

    // Tool interface methods
    call?: (input: T, config?: any) => Promise<U>;
    invoke?: (input: T, config?: any) => Promise<U>;
    batch?: (inputs: T[], config?: any) => Promise<U[]>;
    stream?: (input: T, config?: any) => AsyncGenerator<U>;
    transform?: (
      generator: AsyncGenerator<T>,
      config?: any
    ) => AsyncGenerator<U>;

    // Additional properties
    [key: string]: any;
  }

  export class DynamicStructuredTool<
    T extends Record<string, any> = Record<string, any>,
    U = any,
    V = any,
  > implements StructuredToolInterface<T, U, V>
  {
    name: string;
    description: string;
    schema: any;
    func: (input: T) => Promise<U> | U;

    // LangChain properties
    lc_serializable: boolean;
    lc_kwargs?: Record<string, any>;
    lc_namespace?: string[];

    // Methods
    call?: (input: T, config?: any) => Promise<U>;
    invoke?: (input: T, config?: any) => Promise<U>;
    batch?: (inputs: T[], config?: any) => Promise<U[]>;
    stream?: (input: T, config?: any) => AsyncGenerator<U>;
    transform?: (
      generator: AsyncGenerator<T>,
      config?: any
    ) => AsyncGenerator<U>;

    constructor(config: {
      name: string;
      description: string;
      schema: any;
      func: (input: T) => Promise<U> | U;
      [key: string]: any;
    });

    [key: string]: any;
  }
}

declare module "zod" {
  interface ZodType<
    Output = any,
    Def extends ZodTypeDef = ZodTypeDef,
    Input = Output,
  > {
    // Ensure Zod types are compatible with tool schemas
    _type?: Output;
    _output?: Output;
    _input?: Input;
    _def?: Def;
  }
}

// Global type augmentations
declare global {
  interface ToolInputSchemaBase {
    [key: string]: any;
  }

  // Fix for z.infer type compatibility
  namespace z {
    type infer<T extends any> = T extends { _output: infer U } ? U : any;
  }
}

// Module augmentation for better type inference
declare module "@langchain/core/tools" {
  export interface BaseTool {
    name: string;
    description: string;
    func?: (...args: any[]) => any;
    schema?: any;
    [key: string]: any;
  }
}

// Fix for schema type compatibility
declare module "@langchain/core/tools" {
  export type ToolInputSchema = Record<string, any> | any;
  export type ToolOutputSchema = any;

  export interface StructuredToolParams<T = ToolInputSchema> {
    name: string;
    description: string;
    schema: T;
    func: (input: any) => Promise<any> | any;
  }
}

// Additional type fixes for LangChain compatibility
declare module "@langchain/core/tools" {
  export class Tool {
    name: string;
    description: string;
    func?: (...args: any[]) => any;
    [key: string]: any;
  }

  export interface RunnableInterface<Input = any, Output = any> {
    invoke(input: Input, options?: any): Promise<Output>;
    batch?(inputs: Input[], options?: any): Promise<Output[]>;
    stream?(input: Input, options?: any): AsyncGenerator<Output>;
    transform?(
      generator: AsyncGenerator<Input>,
      options?: any
    ): AsyncGenerator<Output>;
  }
}

// Error handling types
declare global {
  class InsufficientFundsError extends Error {
    fundingData: {
      required: string;
      current: string;
      shortfall: string;
      walletAddress: string;
      recipientAddress?: string;
      asin: string;
    };

    constructor(fundingData: {
      required: string;
      current: string;
      shortfall: string;
      walletAddress: string;
      recipientAddress?: string;
      asin: string;
    });
  }
}

// Export fixes
export {};
