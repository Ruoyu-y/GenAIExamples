<!--
  Copyright (C) 2024 Intel Corporation
  SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
	import MessageAvatar from "$lib/modules/chat/MessageAvatar.svelte";
	import type { Message } from "$lib/shared/constant/Interface";
	import MessageTimer from "./MessageTimer.svelte";
	import { createEventDispatcher } from "svelte";

	let dispatch = createEventDispatcher();

	export let msg: Message;
	export let time: string = "";
</script>

<div
	class={msg.role === 0
		? "flex w-full gap-3"
		: "flex w-full items-center gap-3"}
	data-testid={msg.role === 0
		? "display-answer"
		: "display-question"}
>
	<div
		class={msg.role === 0
			? "flex aspect-square w-[3px]  items-center justify-center rounded bg-[#0597ff] max-sm:hidden"
			: "flex aspect-square h-10 w-[3px] items-center justify-center rounded bg-[#000] max-sm:hidden"}
	>
		<MessageAvatar role={msg.role} />
	</div>
	<div class="group relative items-center">
		<div>
			<p
				class=" max-w-[60vw] items-center whitespace-pre-line break-keep text-[0.8rem] leading-5 sm:max-w-[60rem]"
			>
				{@html msg.content}
			</p>
		</div>
	</div>
</div>
{#if time}
	<div>
		<MessageTimer
			{time}
			on:handleTop={() => {
				dispatch("scrollTop");
			}}
		/>
	</div>
{/if}

<style>
	.wrap-style {
		word-wrap: break-word;
		word-break: break-all;
	}
</style>
